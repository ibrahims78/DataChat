const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const archiver = require('archiver')
const XLSX = require('xlsx')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const { parse } = require('csv-parse/sync')
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const UPLOADS_DIR = path.join(__dirname, '../../../uploads')
const CHUNKS_DIR = path.join(UPLOADS_DIR, 'chunks')
if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true })

// Returns the per-project upload directory, creating it if needed
function getProjectDir(userId, projectId) {
  const dir = path.join(UPLOADS_DIR, 'users', String(userId), 'projects', String(projectId))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Resolve a stored_name to its absolute path.
// Checks the structured path first, falls back to the legacy flat uploads/ path.
function resolveFilePath(storedName, userId, projectId) {
  if (userId && projectId) {
    const structured = path.join(UPLOADS_DIR, 'users', String(userId), 'projects', String(projectId), storedName)
    if (fs.existsSync(structured)) return structured
  }
  return path.join(UPLOADS_DIR, storedName)
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id
    const projectId = req.params.projectId
    if (userId && projectId) {
      cb(null, getProjectDir(userId, projectId))
    } else {
      cb(null, UPLOADS_DIR)
    }
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const chunkStorage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xlsm', '.xls', '.csv', '.pdf', '.docx', '.doc', '.md', '.txt', '.json']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('File type not supported'))
  }
})

const uploadChunk = multer({
  storage: chunkStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
})

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = {
    '.xlsx': 'excel', '.xlsm': 'excel', '.xls': 'excel',
    '.csv': 'csv', '.pdf': 'pdf', '.docx': 'word', '.doc': 'word',
    '.md': 'markdown', '.txt': 'text', '.json': 'json'
  }
  return map[ext] || 'unknown'
}

const LARGE_FILE_THRESHOLD = 15 * 1024 * 1024 // 15 MB

async function getFilePreview(filePath, fileType) {
  try {
    const fileStat = fs.statSync(filePath)
    const isLarge = fileStat.size > LARGE_FILE_THRESHOLD

    if (fileType === 'excel') {
      if (isLarge) return { type: 'text', text: 'ملف Excel كبير — سيتم تحليله عند بدء المحادثة.', totalRows: null, totalCols: null }
      const wb = XLSX.readFile(filePath)
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws || !ws['!ref']) return { type: 'table', headers: [], rows: [], totalRows: 0, totalCols: 0 }
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const headers = data[0] || []
      const rows = data.slice(1, 6)
      const range = XLSX.utils.decode_range(ws['!ref'])
      return { type: 'table', headers, rows, totalRows: range.e.r, totalCols: range.e.c + 1 }
    }
    if (fileType === 'csv') {
      if (isLarge) return { type: 'text', text: 'ملف CSV كبير — سيتم تحليله عند بدء المحادثة.', totalRows: null, totalCols: null }
      const content = fs.readFileSync(filePath, 'utf8')
      const records = parse(content, { skip_empty_lines: true })
      const headers = records[0] || []
      const rows = records.slice(1, 6)
      return { type: 'table', headers, rows, totalRows: records.length - 1, totalCols: headers.length }
    }
    if (fileType === 'pdf') {
      if (isLarge) return { type: 'text', text: 'ملف PDF كبير — سيتم تحليله عند بدء المحادثة.', totalPages: null }
      const buf = fs.readFileSync(filePath)
      const data = await Promise.race([
        pdfParse(buf),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PDF parse timeout')), 15000))
      ])
      return { type: 'text', text: data.text.substring(0, 500), totalPages: data.numpages }
    }
    if (fileType === 'word') {
      if (isLarge) return { type: 'text', text: 'ملف Word كبير — سيتم تحليله عند بدء المحادثة.' }
      const result = await mammoth.extractRawText({ path: filePath })
      return { type: 'text', text: result.value.substring(0, 500) }
    }
    if (fileType === 'markdown' || fileType === 'text') {
      if (isLarge) return { type: fileType === 'markdown' ? 'markdown' : 'text', text: 'ملف نصي كبير — سيتم تحليله عند بدء المحادثة.' }
      const content = fs.readFileSync(filePath, 'utf8')
      return { type: fileType === 'markdown' ? 'markdown' : 'text', text: content.substring(0, 1000) }
    }
    if (fileType === 'json') {
      if (isLarge) return { type: 'json', text: 'ملف JSON كبير — سيتم تحليله عند بدء المحادثة.' }
      const content = fs.readFileSync(filePath, 'utf8')
      try {
        const parsed = JSON.parse(content)
        return { type: 'json', text: JSON.stringify(parsed, null, 2).substring(0, 1000) }
      } catch {
        return { type: 'json', text: content.substring(0, 1000) }
      }
    }
  } catch (e) {
    return { type: 'error', message: e.message }
  }
}

// ─── Generated file routes (must come before /:projectId routes) ───────────

router.get('/generated/:fileId/download', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM generated_files WHERE id=$1', [req.params.fileId])
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    const filePath = path.join(__dirname, '../../../uploads/generated', file.stored_name)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })
    res.download(filePath, file.display_name || file.original_name)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/generated/:fileId', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM generated_files WHERE id=$1', [req.params.fileId])
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    // Verify ownership via project
    const proj = await db.query('SELECT * FROM projects WHERE id=$1', [file.project_id])
    if (proj.rows.length && req.user.role !== 'admin' && proj.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const filePath = path.join(__dirname, '../../../uploads/generated', file.stored_name)
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {})
    await db.query('DELETE FROM generated_files WHERE id=$1', [req.params.fileId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/generated/:fileId/rename', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
    const result = await db.query(
      'UPDATE generated_files SET display_name=$1 WHERE id=$2 RETURNING *',
      [name.trim(), req.params.fileId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    res.json({ file: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Folder routes (must come before /:projectId/:fileId routes) ────────────

router.post('/:projectId/folders', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' })
    const projectCheck = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId])
    if (!projectCheck.rows.length) return res.status(404).json({ error: 'Project not found' })
    if (req.user.role !== 'admin' && projectCheck.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM folders WHERE project_id=$1', [req.params.projectId])
    const result = await db.query(
      'INSERT INTO folders (project_id, name, sort_order) VALUES ($1,$2,$3) RETURNING *',
      [req.params.projectId, name.trim(), parseInt(maxOrder.rows[0].m) + 1]
    )
    res.json({ folder: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:projectId/folders/:folderId', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' })
    const result = await db.query(
      'UPDATE folders SET name=$1 WHERE id=$2 AND project_id=$3 RETURNING *',
      [name.trim(), req.params.folderId, req.params.projectId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Folder not found' })
    res.json({ folder: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:projectId/folders/:folderId', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM folders WHERE id=$1 AND project_id=$2', [req.params.folderId, req.params.projectId])
    if (!result.rows.length) return res.status(404).json({ error: 'Folder not found' })
    // Move files in this folder to uncategorized
    await db.query('UPDATE files SET folder_id=NULL WHERE folder_id=$1', [req.params.folderId])
    await db.query('DELETE FROM folders WHERE id=$1', [req.params.folderId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Reorder routes (must come before /:projectId/:fileId) ──────────────────

router.patch('/:projectId/reorder', async (req, res) => {
  try {
    const { items } = req.body // [{id, sort_order, folder_id}]
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' })
    await Promise.all(items.map(item =>
      db.query(
        'UPDATE files SET sort_order=$1, folder_id=$2 WHERE id=$3 AND project_id=$4',
        [item.sort_order, item.folder_id ?? null, item.id, req.params.projectId]
      )
    ))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:projectId/reorder-generated', async (req, res) => {
  try {
    const { items } = req.body // [{id, sort_order}]
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' })
    await Promise.all(items.map(item =>
      db.query(
        'UPDATE generated_files SET sort_order=$1 WHERE id=$2 AND project_id=$3',
        [item.sort_order, item.id, req.params.projectId]
      )
    ))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Chunked upload routes ────────────────────────────────────────────────────

router.post('/:projectId/upload-chunk', uploadChunk.single('chunk'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No chunk received' })
    const { uploadId, chunkIndex } = req.body
    if (!uploadId || chunkIndex === undefined) return res.status(400).json({ error: 'Missing uploadId or chunkIndex' })
    const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${chunkIndex}`)
    fs.writeFileSync(chunkPath, req.file.buffer)
    res.json({ ok: true, chunkIndex })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:projectId/assemble-chunks', async (req, res) => {
  const { uploadId, fileName, totalChunks } = req.body
  if (!uploadId || !fileName || !totalChunks) return res.status(400).json({ error: 'Missing params' })

  const allowed = ['.xlsx', '.xlsm', '.xls', '.csv', '.pdf', '.docx', '.doc', '.md', '.txt', '.json']
  const ext = path.extname(fileName).toLowerCase()
  if (!allowed.includes(ext)) return res.status(400).json({ error: 'File type not supported' })

  const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
  const storedName = unique + ext

  try {
    const projectCheck = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId])
    if (!projectCheck.rows.length) return res.status(404).json({ error: 'Project not found' })
    if (req.user.role !== 'admin' && projectCheck.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const countCheck = await db.query('SELECT COUNT(*) FROM files WHERE project_id=$1', [req.params.projectId])
    if (parseInt(countCheck.rows[0].count) >= 10) return res.status(400).json({ error: 'Maximum 10 files per project' })

    const projectDir = getProjectDir(req.user.id, req.params.projectId)
    const destPath = path.join(projectDir, storedName)

    const writeStream = fs.createWriteStream(destPath)
    for (let i = 0; i < parseInt(totalChunks); i++) {
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${i}`)
      if (!fs.existsSync(chunkPath)) throw new Error(`Missing chunk ${i}`)
      const data = fs.readFileSync(chunkPath)
      writeStream.write(data)
    }
    await new Promise((resolve, reject) => { writeStream.end(); writeStream.on('finish', resolve); writeStream.on('error', reject) })

    for (let i = 0; i < parseInt(totalChunks); i++) {
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}-${i}`)
      if (fs.existsSync(chunkPath)) fs.unlink(chunkPath, () => {})
    }

    const stat = fs.statSync(destPath)
    const fileType = getFileType(fileName)
    const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM files WHERE project_id=$1', [req.params.projectId])
    const result = await db.query(
      'INSERT INTO files (project_id, original_name, stored_name, file_type, file_size, mime_type, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.projectId, fileName, storedName, fileType, stat.size, null, parseInt(maxOrder.rows[0].m) + 1]
    )
    await db.query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [req.params.projectId])
    const preview = await getFilePreview(destPath, fileType)
    res.json({ file: result.rows[0], preview })
  } catch (err) {
    if (fs.existsSync(destPath)) fs.unlink(destPath, () => {})
    res.status(500).json({ error: err.message })
  }
})

// ─── Upload (must come before /:projectId/:fileId) ───────────────────────────

router.post('/:projectId', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const projectCheck = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId])
    if (!projectCheck.rows.length) return res.status(404).json({ error: 'Project not found' })
    if (req.user.role !== 'admin' && projectCheck.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const countCheck = await db.query('SELECT COUNT(*) FROM files WHERE project_id=$1', [req.params.projectId])
    if (parseInt(countCheck.rows[0].count) >= 10) return res.status(400).json({ error: 'Maximum 10 files per project' })
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    const fileType = getFileType(originalName)
    const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM files WHERE project_id=$1', [req.params.projectId])
    const result = await db.query(
      'INSERT INTO files (project_id, original_name, stored_name, file_type, file_size, mime_type, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.projectId, originalName, req.file.filename, fileType, req.file.size, req.file.mimetype, parseInt(maxOrder.rows[0].m) + 1]
    )
    await db.query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [req.params.projectId])
    const preview = await getFilePreview(req.file.path, fileType)
    res.json({ file: result.rows[0], preview })
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {})
    res.status(500).json({ error: err.message })
  }
})

// ─── Per-file routes ─────────────────────────────────────────────────────────

router.get('/:projectId/:fileId/download', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT f.*, p.user_id FROM files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1 AND f.project_id=$2',
      [req.params.fileId, req.params.projectId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    if (req.user.role !== 'admin' && file.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const filePath = resolveFilePath(file.stored_name, file.user_id, req.params.projectId)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })
    res.download(filePath, file.display_name || file.original_name)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:projectId/:fileId/preview', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT f.*, p.user_id FROM files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1 AND f.project_id=$2',
      [req.params.fileId, req.params.projectId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    const filePath = resolveFilePath(file.stored_name, file.user_id, req.params.projectId)
    const preview = await getFilePreview(filePath, file.file_type)
    res.json({ file, preview })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:projectId/:fileId/rename', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
    const result = await db.query(
      'UPDATE files SET display_name=$1 WHERE id=$2 AND project_id=$3 RETURNING *',
      [name.trim(), req.params.fileId, req.params.projectId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    res.json({ file: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:projectId/:fileId', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT f.*, p.user_id FROM files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1 AND f.project_id=$2',
      [req.params.fileId, req.params.projectId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    const filePath = resolveFilePath(file.stored_name, file.user_id, req.params.projectId)
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {})
    await db.query('DELETE FROM files WHERE id=$1', [req.params.fileId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Download entire project as ZIP ──────────────────────────────────────────

router.get('/:projectId/download-zip', async (req, res) => {
  try {
    const projectCheck = await db.query(
      'SELECT p.*, u.name as user_name FROM projects p LEFT JOIN users u ON p.user_id=u.id WHERE p.id=$1',
      [req.params.projectId]
    )
    if (!projectCheck.rows.length) return res.status(404).json({ error: 'Project not found' })
    const project = projectCheck.rows[0]
    if (req.user.role !== 'admin' && project.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const [filesResult, genFilesResult, convResult] = await Promise.all([
      db.query('SELECT * FROM files WHERE project_id=$1', [req.params.projectId]),
      db.query('SELECT * FROM generated_files WHERE project_id=$1', [req.params.projectId]),
      db.query('SELECT id FROM conversations WHERE project_id=$1 LIMIT 1', [req.params.projectId])
    ])

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(project.name || 'project')}.zip`)
    res.setHeader('Content-Type', 'application/zip')

    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.on('error', err => { console.error('Archive error:', err); res.end() })
    archive.pipe(res)

    // ── Uploaded files ──────────────────────────────────────────────────────
    for (const file of filesResult.rows) {
      const filePath = resolveFilePath(file.stored_name, project.user_id, project.id)
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `الملفات_المرفوعة/${file.display_name || file.original_name}` })
      }
    }

    // ── AI-generated files ──────────────────────────────────────────────────
    for (const file of genFilesResult.rows) {
      const filePath = path.join(UPLOADS_DIR, 'generated', file.stored_name)
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `الملفات_المولدة/${file.display_name || file.original_name}` })
      }
    }

    // ── Chat history as Excel ───────────────────────────────────────────────
    if (convResult.rows.length) {
      const messagesResult = await db.query(
        'SELECT role, content, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at',
        [convResult.rows[0].id]
      )
      if (messagesResult.rows.length) {
        const wb = XLSX.utils.book_new()
        const rows = messagesResult.rows.map(m => ({
          'المرسل': m.role === 'user' ? 'المستخدم' : 'DataChat',
          'الرسالة': m.content,
          'الوقت': new Date(m.created_at).toLocaleString('ar-EG')
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        ws['!cols'] = [{ wch: 12 }, { wch: 80 }, { wch: 20 }]
        XLSX.utils.book_append_sheet(wb, ws, 'المحادثة')
        const chatBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
        archive.append(chatBuffer, { name: 'المحادثة.xlsx' })
      }
    }

    await archive.finalize()
  } catch (err) {
    console.error('Download ZIP error:', err)
    if (!res.headersSent) res.status(500).json({ error: err.message })
  }
})

module.exports = router
