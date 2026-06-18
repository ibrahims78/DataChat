const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const { parse } = require('csv-parse/sync')
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../../uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('File type not supported'))
  }
})

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = { '.xlsx': 'excel', '.xls': 'excel', '.csv': 'csv', '.pdf': 'pdf', '.docx': 'word', '.doc': 'word' }
  return map[ext] || 'unknown'
}

async function getFilePreview(filePath, fileType) {
  try {
    if (fileType === 'excel') {
      const wb = XLSX.readFile(filePath)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const headers = data[0] || []
      const rows = data.slice(1, 6)
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      return { type: 'table', headers, rows, totalRows: range.e.r, totalCols: range.e.c + 1 }
    }
    if (fileType === 'csv') {
      const content = fs.readFileSync(filePath, 'utf8')
      const records = parse(content, { skip_empty_lines: true })
      const headers = records[0] || []
      const rows = records.slice(1, 6)
      return { type: 'table', headers, rows, totalRows: records.length - 1, totalCols: headers.length }
    }
    if (fileType === 'pdf') {
      const buf = fs.readFileSync(filePath)
      const data = await pdfParse(buf)
      return { type: 'text', text: data.text.substring(0, 500), totalPages: data.numpages }
    }
    if (fileType === 'word') {
      const result = await mammoth.extractRawText({ path: filePath })
      return { type: 'text', text: result.value.substring(0, 500) }
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
    const result = await db.query('SELECT * FROM files WHERE id=$1 AND project_id=$2', [req.params.fileId, req.params.projectId])
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    const filePath = path.join(__dirname, '../../../uploads', file.stored_name)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })
    const projectCheck = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId])
    if (projectCheck.rows.length && req.user.role !== 'admin' && projectCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    res.download(filePath, file.display_name || file.original_name)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:projectId/:fileId/preview', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM files WHERE id=$1 AND project_id=$2', [req.params.fileId, req.params.projectId])
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const file = result.rows[0]
    const filePath = path.join(__dirname, '../../../uploads', file.stored_name)
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
    const result = await db.query('SELECT * FROM files WHERE id=$1 AND project_id=$2', [req.params.fileId, req.params.projectId])
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' })
    const filePath = path.join(__dirname, '../../../uploads', result.rows[0].stored_name)
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {})
    await db.query('DELETE FROM files WHERE id=$1', [req.params.fileId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
