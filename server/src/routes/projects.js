const express = require('express')
const path = require('path')
const fs = require('fs')
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')

const UPLOADS_DIR = path.join(__dirname, '../../../uploads')

function deleteProjectDir(userId, projectId) {
  try {
    const dir = path.join(UPLOADS_DIR, 'users', String(userId), 'projects', String(projectId))
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    console.error('Error deleting project dir:', e.message)
  }
}

function deleteProjectFiles(files) {
  for (const f of files) {
    try {
      const flat = path.join(UPLOADS_DIR, f.stored_name)
      if (fs.existsSync(flat)) fs.unlink(flat, () => {})
    } catch {}
  }
}

const router = express.Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  try {
    const { sort = 'updated_at', order = 'DESC', type } = req.query
    const isAdmin = req.user.role === 'admin'
    const allowedSorts = { 'updated_at': 'p.updated_at', 'created_at': 'p.created_at', 'name': 'p.name', 'messages': 'msg_count' }
    const sortCol = allowedSorts[sort] || 'p.updated_at'
    const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    let query = `
      SELECT p.*, u.name as user_name,
        COUNT(DISTINCT f.id) as file_count,
        COUNT(DISTINCT m.id) as message_count,
        (SELECT f2.file_type FROM files f2 WHERE f2.project_id = p.id LIMIT 1) as primary_type
      FROM projects p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN files f ON f.project_id = p.id
      LEFT JOIN conversations c ON c.project_id = p.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE 1=1
    `
    const params = []
    if (!isAdmin) { params.push(req.user.id); query += ` AND p.user_id = $${params.length}` }
    if (type && type !== 'all') { params.push(type); query += ` AND f.file_type = $${params.length}` }
    query += ` GROUP BY p.id, u.name ORDER BY p.pinned DESC, ${sortCol} ${sortDir}`

    const result = await db.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
    const result = await db.query(
      'INSERT INTO projects (user_id, name) VALUES ($1,$2) RETURNING *',
      [req.user.id, name.trim()]
    )
    const conv = await db.query('INSERT INTO conversations (project_id) VALUES ($1) RETURNING id', [result.rows[0].id])
    res.json({ ...result.rows[0], conversation_id: conv.rows[0].id, file_count: 0, message_count: 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, u.name as user_name,
        COUNT(DISTINCT f.id) as file_count,
        COUNT(DISTINCT m.id) as message_count
      FROM projects p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN files f ON f.project_id = p.id
      LEFT JOIN conversations c ON c.project_id = p.id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE p.id = $1
      GROUP BY p.id, u.name
    `, [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    const project = result.rows[0]
    if (req.user.role !== 'admin' && project.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const [filesResult, convResult, genFilesResult, foldersResult] = await Promise.all([
      db.query('SELECT * FROM files WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC', [req.params.id]),
      db.query('SELECT id FROM conversations WHERE project_id = $1 LIMIT 1', [req.params.id]),
      db.query('SELECT * FROM generated_files WHERE project_id = $1 ORDER BY sort_order ASC, created_at DESC', [req.params.id]),
      db.query('SELECT * FROM folders WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC', [req.params.id])
    ])
    let messages = []
    if (convResult.rows.length) {
      const msgs = await db.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at', [convResult.rows[0].id])
      messages = msgs.rows
    }
    res.json({
      ...project,
      files: filesResult.rows,
      messages,
      generated_files: genFilesResult.rows,
      folders: foldersResult.rows,
      conversation_id: convResult.rows[0]?.id
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { name, pinned } = req.body
    const check = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.id])
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' })
    if (req.user.role !== 'admin' && check.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const updates = [], params = []
    if (name !== undefined) { params.push(name); updates.push(`name=$${params.length}`) }
    if (pinned !== undefined) { params.push(pinned); updates.push(`pinned=$${params.length}`) }
    params.push(new Date()); updates.push(`updated_at=$${params.length}`)
    params.push(req.params.id)
    await db.query(`UPDATE projects SET ${updates.join(',')} WHERE id=$${params.length}`, params)
    const result = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.id])
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const check = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.id])
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' })
    if (req.user.role !== 'admin' && check.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
    const project = check.rows[0]

    // Fetch all uploaded + generated files before cascade-deleting from DB
    const [filesRes, genFilesRes] = await Promise.all([
      db.query('SELECT stored_name FROM files WHERE project_id=$1', [project.id]),
      db.query('SELECT stored_name FROM generated_files WHERE project_id=$1', [project.id])
    ])

    await db.query('DELETE FROM projects WHERE id=$1', [project.id])

    // Delete structured project directory (new uploads)
    deleteProjectDir(project.user_id, project.id)

    // Also clean up any legacy flat-stored files for this project
    deleteProjectFiles(filesRes.rows)

    // Delete generated files
    for (const f of genFilesRes.rows) {
      try {
        const p = path.join(UPLOADS_DIR, 'generated', f.stored_name)
        if (fs.existsSync(p)) fs.unlink(p, () => {})
      } catch {}
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
