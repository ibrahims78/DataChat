const express = require('express')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const db = require('../lib/db')
const { authenticate, adminOnly } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate, adminOnly)

router.get('/stats', async (req, res) => {
  try {
    const [users, projects, genFiles, messages] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE is_active=true"),
      db.query('SELECT COUNT(*) FROM projects'),
      db.query('SELECT COUNT(*) FROM generated_files'),
      db.query('SELECT COUNT(*) FROM messages')
    ])
    res.json({
      activeUsers: parseInt(users.rows[0].count),
      totalProjects: parseInt(projects.rows[0].count),
      generatedFiles: parseInt(genFiles.rows[0].count),
      totalMessages: parseInt(messages.rows[0].count)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/users', async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY role DESC, created_at')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body
    const existing = await db.query('SELECT id FROM users WHERE email=$1', [email])
    if (existing.rows.length) return res.status(400).json({ error: 'Email already exists' })
    const hash = await bcrypt.hash(password, 12)
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email, hash, 'employee']
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/users/invite', async (req, res) => {
  try {
    const { email } = req.body
    const token = uuidv4()
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await db.query('INSERT INTO invite_tokens (email, token, created_by, expires_at) VALUES ($1,$2,$3,$4)', [email, token, req.user.id, expires])
    res.json({ inviteLink: `/register?token=${token}`, message: 'Invite created' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })
    const check = await db.query('SELECT role FROM users WHERE id=$1', [req.params.id])
    if (!check.rows.length) return res.status(404).json({ error: 'User not found' })
    if (check.rows[0].role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' })
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/settings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_settings WHERE id=1')
    res.json(result.rows[0] || {})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/settings', async (req, res) => {
  try {
    const { system_prompt, temperature, model } = req.body
    await db.query(
      'UPDATE ai_settings SET system_prompt=$1, temperature=$2, model=$3, updated_at=NOW() WHERE id=1',
      [system_prompt, temperature, model]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/profile', async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body
    const user = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id])
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' })
    const updates = [], params = []
    if (name) { params.push(name); updates.push(`name=$${params.length}`) }
    if (email) { params.push(email); updates.push(`email=$${params.length}`) }
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' })
      const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash)
      if (!valid) return res.status(401).json({ error: 'Current password incorrect' })
      const hash = await bcrypt.hash(newPassword, 12)
      params.push(hash); updates.push(`password_hash=$${params.length}`)
    }
    if (updates.length) {
      params.push(req.user.id)
      await db.query(`UPDATE users SET ${updates.join(',')} WHERE id=$${params.length}`, params)
    }
    const result = await db.query('SELECT id, name, email, role FROM users WHERE id=$1', [req.user.id])
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/account', async (req, res) => {
  try {
    const { confirmation } = req.body
    if (confirmation !== 'تأكيد' && confirmation !== 'confirm') return res.status(400).json({ error: 'Invalid confirmation' })
    await db.query('DELETE FROM users WHERE id=$1', [req.user.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/ratings', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT m.id, m.content, m.rating, m.rating_comment, m.created_at,
             p.name as project_name, u.name as user_name
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN projects p ON p.id = c.project_id
      JOIN users u ON u.id = p.user_id
      WHERE m.rating IS NOT NULL
      ORDER BY m.created_at DESC LIMIT 50
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
