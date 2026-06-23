const express = require('express')
const { google } = require('googleapis')
const db = require('../lib/db')
const { authenticate, adminOnly } = require('../middleware/auth')
const xlsx = require('xlsx')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')
const multer = require('multer')
const { Readable } = require('stream')
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

const router = express.Router()

function getRedirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}/api/drive/auth/callback`
}

async function getOAuthClient(req) {
  const settings = await db.query('SELECT client_id, client_secret FROM google_drive_settings WHERE id = 1')
  const s = settings.rows[0]
  if (!s?.client_id || !s?.client_secret) throw new Error('Google Drive غير مُهيأ. يرجى إضافة Client ID و Client Secret في الإعدادات.')
  return new google.auth.OAuth2(s.client_id, s.client_secret, getRedirectUri(req))
}

async function getAuthedClient(req) {
  const oauth2Client = await getOAuthClient(req)
  const tokenRow = await db.query('SELECT * FROM google_oauth WHERE user_id = $1', [req.user.id])
  if (!tokenRow.rows.length) throw new Error('لم يتم ربط حساب Google. يرجى تسجيل الدخول عبر Google Drive أولاً.')
  const tok = tokenRow.rows[0]
  oauth2Client.setCredentials({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expiry_date: tok.token_expiry ? new Date(tok.token_expiry).getTime() : null,
  })
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.query(
        'UPDATE google_oauth SET access_token=$1, token_expiry=$2, updated_at=NOW() WHERE user_id=$3',
        [tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null, req.user.id]
      )
    }
  })
  return oauth2Client
}

// ─── Admin: Drive Settings ───────────────────────────────────────────────────
router.get('/settings', authenticate, adminOnly, async (req, res) => {
  try {
    const r = await db.query('SELECT client_id, client_secret FROM google_drive_settings WHERE id = 1')
    const s = r.rows[0] || {}
    res.json({
      client_id: s.client_id || '',
      has_client_secret: !!(s.client_secret),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/settings', authenticate, adminOnly, async (req, res) => {
  try {
    const { client_id, client_secret } = req.body
    if (client_secret && client_secret !== '••••••••') {
      await db.query(
        'UPDATE google_drive_settings SET client_id=$1, client_secret=$2, updated_at=NOW() WHERE id=1',
        [client_id, client_secret]
      )
    } else {
      await db.query(
        'UPDATE google_drive_settings SET client_id=$1, updated_at=NOW() WHERE id=1',
        [client_id]
      )
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── OAuth Flow ───────────────────────────────────────────────────────────────
router.get('/auth/url', authenticate, async (req, res) => {
  try {
    const oauth2Client = await getOAuthClient(req)
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive',
      ],
      state: String(req.user.id),
      include_granted_scopes: true,
    })
    res.json({ url })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query
    if (error) return res.redirect(`/drive?error=${encodeURIComponent(error)}`)
    if (!code || !state) return res.redirect('/drive?error=missing_params')

    const userId = parseInt(state)
    const settingsRow = await db.query('SELECT client_id, client_secret FROM google_drive_settings WHERE id = 1')
    const s = settingsRow.rows[0]
    if (!s?.client_id || !s?.client_secret) return res.redirect('/drive?error=not_configured')

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001'
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const redirectUri = `${proto}://${host}/api/drive/auth/callback`

    const oauth2Client = new google.auth.OAuth2(s.client_id, s.client_secret, redirectUri)
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    let email = null
    let name = null
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
        email = payload.email || null
        name = payload.name || null
      } catch (_) {}
    }
    if (!email) {
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client })
      const userInfo = await oauth2Api.userinfo.get()
      email = userInfo.data.email || null
      name = userInfo.data.name || null
    }

    await db.query(
      `INSERT INTO google_oauth (user_id, access_token, refresh_token, token_expiry, google_email, google_name, connected_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         access_token=EXCLUDED.access_token,
         refresh_token=COALESCE(EXCLUDED.refresh_token, google_oauth.refresh_token),
         token_expiry=EXCLUDED.token_expiry,
         google_email=EXCLUDED.google_email,
         google_name=EXCLUDED.google_name,
         updated_at=NOW()`,
      [
        userId,
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        email,
        name,
      ]
    )
    res.redirect('/drive?connected=1')
  } catch (err) {
    console.error('Drive callback error:', err)
    res.redirect(`/drive?error=${encodeURIComponent(err.message)}`)
  }
})

router.get('/status', authenticate, async (req, res) => {
  try {
    const tokenRow = await db.query('SELECT google_email, google_name, connected_at FROM google_oauth WHERE user_id=$1', [req.user.id])
    const settings = await db.query('SELECT client_id FROM google_drive_settings WHERE id=1')
    res.json({
      configured: !!(settings.rows[0]?.client_id),
      connected: tokenRow.rows.length > 0,
      google_email: tokenRow.rows[0]?.google_email || null,
      google_name: tokenRow.rows[0]?.google_name || null,
      connected_at: tokenRow.rows[0]?.connected_at || null,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/auth/disconnect', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM google_oauth WHERE user_id=$1', [req.user.id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Upload local file (from browser) to Drive ────────────────────────────────
router.post('/upload-local', authenticate, uploadMem.single('file'), async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    if (!req.file) return res.status(400).json({ error: 'لم يتم إرسال ملف' })

    const { folderId } = req.body
    const fileMetadata = { name: req.file.originalname }
    if (folderId && folderId !== 'root') fileMetadata.parents = [folderId]

    const stream = Readable.from(req.file.buffer)
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: req.file.mimetype || 'application/octet-stream', body: stream },
      fields: 'id,name,webViewLink',
    })
    res.json({ ok: true, driveFile: response.data })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── File Operations ──────────────────────────────────────────────────────────
router.get('/files', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const folderId = req.query.folderId || 'root'
    const pageToken = req.query.pageToken || undefined
    const q = req.query.q || ''

    const allFolders = req.query.allFolders === '1'
    let query = `'${folderId}' in parents and trashed = false`
    if (allFolders) query = `mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    else if (q) query = `name contains '${q.replace(/'/g, "\\'")}' and trashed = false`

    const resp = await drive.files.list({
      q: query,
      pageSize: 100,
      pageToken: pageToken || undefined,
      orderBy: 'folder,name',
      fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,parents,iconLink,thumbnailLink,webViewLink)',
    })

    res.json({
      files: resp.data.files || [],
      nextPageToken: resp.data.nextPageToken || null,
    })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.get('/file/:id/meta', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const file = await drive.files.get({
      fileId: req.params.id,
      fields: 'id,name,mimeType,size,modifiedTime,parents,webViewLink',
    })
    res.json(file.data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.post('/file/:id/rename', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'الاسم مطلوب' })
    await drive.files.update({ fileId: req.params.id, requestBody: { name: name.trim() } })
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.delete('/file/:id', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const { permanent } = req.query
    if (permanent === '1') {
      await drive.files.delete({ fileId: req.params.id })
    } else {
      await drive.files.update({ fileId: req.params.id, requestBody: { trashed: true } })
    }
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.post('/file/:id/copy', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const { name, folderId } = req.body
    const requestBody = {}
    if (name) requestBody.name = name
    if (folderId) requestBody.parents = [folderId]
    const copied = await drive.files.copy({ fileId: req.params.id, requestBody })
    res.json(copied.data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.patch('/file/:id/move', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const { targetFolderId } = req.body
    if (!targetFolderId) return res.status(400).json({ error: 'targetFolderId مطلوب' })
    const meta = await drive.files.get({ fileId: req.params.id, fields: 'parents' })
    const prev = (meta.data.parents || []).join(',')
    await drive.files.update({
      fileId: req.params.id,
      addParents: targetFolderId,
      removeParents: prev,
      requestBody: {},
    })
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.post('/folder', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const { name, parentId } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'اسم المجلد مطلوب' })
    const folder = await drive.files.create({
      requestBody: {
        name: name.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId || 'root'],
      },
      fields: 'id, name',
    })
    res.json(folder.data)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.post('/file/:id/import', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const { projectId } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId مطلوب' })

    const meta = await drive.files.get({
      fileId: req.params.id,
      fields: 'id,name,mimeType,size',
    })
    const fileMeta = meta.data

    let exportMimeType = null
    const nativeGoogleTypes = {
      'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
      'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
      'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
    }
    if (nativeGoogleTypes[fileMeta.mimeType]) {
      exportMimeType = nativeGoogleTypes[fileMeta.mimeType]
    }

    let buffer
    if (exportMimeType) {
      const resp = await drive.files.export({ fileId: req.params.id, mimeType: exportMimeType.mime }, { responseType: 'arraybuffer' })
      buffer = Buffer.from(resp.data)
    } else {
      const resp = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'arraybuffer' })
      buffer = Buffer.from(resp.data)
    }

    const fileName = exportMimeType
      ? (fileMeta.name.endsWith(exportMimeType.ext) ? fileMeta.name : fileMeta.name + exportMimeType.ext)
      : fileMeta.name

    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const supportedExts = ['xlsx','xls','xlsm','csv','pdf','docx','doc','txt','json','md','html','htm','jpg','jpeg','png','gif','webp','bmp']
    if (!supportedExts.includes(ext)) {
      return res.status(400).json({ error: `الصيغة .${ext} غير مدعومة` })
    }

    const path = require('path')
    const fs = require('fs')
    const { v4: uuidv4 } = require('uuid')

    const projectRow = await db.query('SELECT user_id FROM projects WHERE id=$1', [projectId])
    if (!projectRow.rows.length) return res.status(404).json({ error: 'المشروع غير موجود' })

    const userDir = path.join(__dirname, '../../../uploads/users', `user_${projectRow.rows[0].user_id}`, 'projects', `project_${projectId}`)
    fs.mkdirSync(userDir, { recursive: true })
    const storedName = `${uuidv4()}.${ext}`
    fs.writeFileSync(path.join(userDir, storedName), buffer)

    const mimeMap = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      csv: 'text/csv',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      txt: 'text/plain',
      json: 'application/json',
      md: 'text/markdown',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
      webp: 'image/webp', bmp: 'image/bmp',
    }

    const inserted = await db.query(
      `INSERT INTO files (project_id, original_name, stored_name, file_type, file_size, mime_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [projectId, fileName, storedName, ext, buffer.length, mimeMap[ext] || 'application/octet-stream']
    )

    res.json({ ok: true, fileId: inserted.rows[0].id, name: fileName })
  } catch (err) {
    console.error('Drive import error:', err)
    res.status(400).json({ error: err.message })
  }
})

router.get('/file/:id/preview', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })

    const meta = await drive.files.get({ fileId: req.params.id, fields: 'id,name,mimeType,size' })
    const fileMeta = meta.data
    const ext = fileMeta.name.split('.').pop()?.toLowerCase() || ''

    let buffer
    const nativeGoogleTypes = {
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    if (nativeGoogleTypes[fileMeta.mimeType]) {
      const resp = await drive.files.export({ fileId: req.params.id, mimeType: nativeGoogleTypes[fileMeta.mimeType] }, { responseType: 'arraybuffer' })
      buffer = Buffer.from(resp.data)
    } else {
      const resp = await drive.files.get({ fileId: req.params.id, alt: 'media' }, { responseType: 'arraybuffer' })
      buffer = Buffer.from(resp.data)
    }

    const actualExt = nativeGoogleTypes[fileMeta.mimeType] ? (fileMeta.mimeType.includes('spreadsheet') ? 'xlsx' : 'docx') : ext

    let preview = null
    if (['xlsx','xls','xlsm'].includes(actualExt)) {
      const wb = xlsx.read(buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' })
      preview = { type: 'excel', sheetNames: wb.SheetNames, rows: json.slice(0, 50) }
    } else if (actualExt === 'csv') {
      const text = buffer.toString('utf8')
      const rows = text.split('\n').slice(0, 50).map(r => r.split(','))
      preview = { type: 'csv', rows }
    } else if (actualExt === 'pdf') {
      try {
        const data = await pdf(buffer)
        preview = { type: 'pdf', text: data.text.slice(0, 2000), pages: data.numpages }
      } catch { preview = { type: 'pdf', text: 'لا يمكن قراءة هذا الملف', pages: 0 } }
    } else if (['docx','doc'].includes(actualExt)) {
      const r = await mammoth.extractRawText({ buffer })
      preview = { type: 'word', text: r.value.slice(0, 2000) }
    } else if (['txt','md','json','html','htm'].includes(actualExt)) {
      preview = { type: 'text', text: buffer.toString('utf8').slice(0, 3000) }
    } else if (['jpg','jpeg','png','gif','webp','bmp'].includes(actualExt)) {
      const b64 = buffer.toString('base64')
      preview = { type: 'image', data: `data:${fileMeta.mimeType};base64,${b64}` }
    } else {
      preview = { type: 'unsupported' }
    }

    res.json({ name: fileMeta.name, size: fileMeta.size, preview })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.get('/breadcrumb', authenticate, async (req, res) => {
  try {
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })
    const folderId = req.query.folderId || 'root'
    if (folderId === 'root') return res.json([{ id: 'root', name: 'My Drive' }])

    const crumbs = []
    let currentId = folderId
    for (let i = 0; i < 10; i++) {
      if (currentId === 'root') { crumbs.unshift({ id: 'root', name: 'My Drive' }); break }
      try {
        const f = await drive.files.get({ fileId: currentId, fields: 'id,name,parents' })
        crumbs.unshift({ id: f.data.id, name: f.data.name })
        currentId = f.data.parents?.[0] || 'root'
      } catch { break }
    }
    res.json(crumbs)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.get('/projects', authenticate, async (req, res) => {
  try {
    const r = await db.query('SELECT id, name FROM projects WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Project Drive Links (AI direct access) ──────────────────────────────────

router.get('/projects/:projectId/links', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params
    const proj = await db.query('SELECT user_id FROM projects WHERE id=$1', [projectId])
    if (!proj.rows.length) return res.status(404).json({ error: 'Not found' })
    if (req.user.role !== 'admin' && proj.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const r = await db.query('SELECT * FROM project_drive_links WHERE project_id=$1 ORDER BY linked_at DESC', [projectId])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/projects/:projectId/links', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params
    const { drive_file_id, drive_file_name, drive_mime_type } = req.body
    if (!drive_file_id || !drive_file_name) return res.status(400).json({ error: 'Missing fields' })
    const proj = await db.query('SELECT user_id FROM projects WHERE id=$1', [projectId])
    if (!proj.rows.length) return res.status(404).json({ error: 'Not found' })
    if (req.user.role !== 'admin' && proj.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const r = await db.query(
      `INSERT INTO project_drive_links (project_id, user_id, drive_file_id, drive_file_name, drive_mime_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id, drive_file_id) DO UPDATE SET drive_file_name=$4, drive_mime_type=$5
       RETURNING *`,
      [projectId, req.user.id, drive_file_id, drive_file_name, drive_mime_type || null]
    )
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/projects/:projectId/links/:driveFileId', authenticate, async (req, res) => {
  try {
    const { projectId, driveFileId } = req.params
    const proj = await db.query('SELECT user_id FROM projects WHERE id=$1', [projectId])
    if (!proj.rows.length) return res.status(404).json({ error: 'Not found' })
    if (req.user.role !== 'admin' && proj.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    await db.query('DELETE FROM project_drive_links WHERE project_id=$1 AND drive_file_id=$2', [projectId, driveFileId])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── Upload generated file to Drive ──────────────────────────────────────────

router.post('/upload-generated/:genFileId', authenticate, async (req, res) => {
  const fs = require('fs')
  const path = require('path')
  try {
    const { genFileId } = req.params
    const { folderId } = req.body
    const auth = await getAuthedClient(req)
    const drive = google.drive({ version: 'v3', auth })

    const genFile = await db.query(
      'SELECT gf.*, p.user_id FROM generated_files gf JOIN projects p ON p.id=gf.project_id WHERE gf.id=$1',
      [genFileId]
    )
    if (!genFile.rows.length) return res.status(404).json({ error: 'File not found' })
    if (req.user.role !== 'admin' && genFile.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })

    const f = genFile.rows[0]
    const UPLOADS_DIR = path.join(__dirname, '../../../uploads')

    const padId = id => String(id).padStart(4, '0')
    let filePath = path.join(UPLOADS_DIR, 'users', `user_${padId(f.user_id)}`, 'projects', `project_${padId(f.project_id)}`, f.stored_name)
    if (!fs.existsSync(filePath)) filePath = path.join(UPLOADS_DIR, 'generated', f.stored_name)
    if (!fs.existsSync(filePath)) filePath = path.join(UPLOADS_DIR, f.stored_name)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })

    const mimeMap = {
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      html: 'text/html',
      markdown: 'text/markdown',
      text: 'text/plain',
      json: 'application/json',
      csv: 'text/csv',
    }
    const mime = mimeMap[f.file_type] || 'application/octet-stream'
    const fileMetadata = { name: f.original_name || f.stored_name }
    if (folderId && folderId !== 'root') fileMetadata.parents = [folderId]

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: mime, body: fs.createReadStream(filePath) },
      fields: 'id,name,webViewLink',
    })
    res.json({ ok: true, driveFile: response.data })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

module.exports = router
