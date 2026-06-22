const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const db = require('../lib/db')
const { authenticate, JWT_SECRET } = require('../middleware/auth')

const router = express.Router()

router.get('/setup-required', async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*) FROM users WHERE role = $1', ['admin'])
    res.json({ required: parseInt(result.rows[0].count) === 0 })
  } catch {
    res.json({ required: true })
  }
})

router.post('/setup', async (req, res) => {
  try {
    const { name, email, password } = req.body
    const count = await db.query('SELECT COUNT(*) FROM users WHERE role = $1', ['admin'])
    if (parseInt(count.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Admin already exists' })
    }
    const hash = await bcrypt.hash(password, 12)
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash, role, onboarding_done) VALUES ($1,$2,$3,$4,true) RETURNING id, name, email, role',
      [name, email, hash, 'admin']
    )
    const user = result.rows[0]
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body
    const result = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email])
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' })
    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const expiresIn = remember ? '7d' : '1d'
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn })
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, onboarding_done: user.onboarding_done } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, role, onboarding_done FROM users WHERE id = $1', [req.user.id])
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    const result = await db.query('SELECT id FROM users WHERE email = $1', [email])
    if (!result.rows.length) return res.json({ message: 'If account exists, email sent' })
    const token = uuidv4()
    const expires = new Date(Date.now() + 60 * 60 * 1000)
    await db.query('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)', [result.rows[0].id, token, expires])
    res.json({ message: 'If account exists, email sent', resetLink: `/reset-password?token=${token}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Token required' })
    const result = await db.query('SELECT id FROM reset_tokens WHERE token=$1 AND used=false AND expires_at > NOW()', [token])
    if (!result.rows.length) return res.status(400).json({ error: 'رابط غير صالح أو منتهي الصلاحية' })
    res.json({ valid: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' })
    if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
    const result = await db.query('SELECT * FROM reset_tokens WHERE token=$1 AND used=false AND expires_at > NOW()', [token])
    if (!result.rows.length) return res.status(400).json({ error: 'رابط غير صالح أو منتهي الصلاحية' })
    const hash = await bcrypt.hash(password, 12)
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, result.rows[0].user_id])
    await db.query('UPDATE reset_tokens SET used=true WHERE token=$1', [token])
    res.json({ message: 'تم تحديث كلمة المرور بنجاح' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/invite/:token', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT email, expires_at, used FROM invite_tokens WHERE token=$1',
      [req.params.token]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'رابط الدعوة غير صالح' })
    const invite = result.rows[0]
    if (invite.used) return res.status(400).json({ error: 'تم استخدام رابط الدعوة من قبل' })
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'انتهت صلاحية رابط الدعوة' })
    res.json({ email: invite.email, valid: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/register', async (req, res) => {
  try {
    const { token, name, password } = req.body
    if (!token || !name || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' })
    const inv = await db.query(
      'SELECT * FROM invite_tokens WHERE token=$1 AND used=false AND expires_at > NOW()',
      [token]
    )
    if (!inv.rows.length) return res.status(400).json({ error: 'رابط الدعوة غير صالح أو منتهي الصلاحية' })
    const invite = inv.rows[0]
    const existing = await db.query('SELECT id FROM users WHERE email=$1', [invite.email])
    if (existing.rows.length) return res.status(400).json({ error: 'هذا البريد مسجّل مسبقاً' })
    const hash = await bcrypt.hash(password, 12)
    const user = await db.query(
      'INSERT INTO users (name, email, password_hash, role, onboarding_done) VALUES ($1,$2,$3,$4,false) RETURNING id, name, email, role, onboarding_done',
      [name, invite.email, hash, 'employee']
    )
    await db.query('UPDATE invite_tokens SET used=true WHERE token=$1', [token])
    const jwtToken = jwt.sign({ id: user.rows[0].id, role: 'employee' }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token: jwtToken, user: user.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/complete-onboarding', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE users SET onboarding_done=true WHERE id=$1', [req.user.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Change password — available to all authenticated users (admin & employee)
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'جميع الحقول مطلوبة' })
    if (newPassword.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
    const user = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])
    if (!user.rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' })
    const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash)
    if (!valid) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' })
    const hash = await bcrypt.hash(newPassword, 12)
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
