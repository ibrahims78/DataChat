const express = require('express')
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')

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
    const files = await db.query('SELECT * FROM files WHERE project_id = $1 ORDER BY created_at', [req.params.id])
    const conv = await db.query('SELECT id FROM conversations WHERE project_id = $1 LIMIT 1', [req.params.id])
    let messages = []
    if (conv.rows.length) {
      const msgs = await db.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at', [conv.rows[0].id])
      messages = msgs.rows
    }
    const genFiles = await db.query('SELECT * FROM generated_files WHERE project_id = $1 ORDER BY created_at DESC', [req.params.id])
    res.json({ ...project, files: files.rows, messages, generated_files: genFiles.rows, conversation_id: conv.rows[0]?.id })
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
    await db.query('DELETE FROM projects WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
