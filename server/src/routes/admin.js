const express = require('express')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const nodemailer = require('nodemailer')
const db = require('../lib/db')
const { authenticate, adminOnly } = require('../middleware/auth')

async function getMailer() {
  const result = await db.query('SELECT smtp_user, smtp_pass FROM email_settings WHERE id=1').catch(() => ({ rows: [] }))
  const row = result.rows[0] || {}
  const user = row.smtp_user || process.env.SMTP_USER
  const pass = row.smtp_pass || process.env.SMTP_PASS
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

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
    if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' })
    const token = uuidv4()
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await db.query('INSERT INTO invite_tokens (email, token, created_by, expires_at) VALUES ($1,$2,$3,$4)', [email, token, req.user.id, expires])
    const origin = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 3001}`
    const inviteLink = `${origin}/register?token=${token}`

    const mailer = await getMailer()
    if (mailer) {
      await mailer.sendMail({
        from: `"DataChat" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'دعوة للانضمام إلى DataChat',
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;background:#f5f3ff;border-radius:12px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="background:#7c3aed;width:56px;height:56px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="color:white;font-size:24px;">🗄️</span>
              </div>
              <h1 style="color:#1e1b4b;margin:0;font-size:22px;">DataChat</h1>
            </div>
            <div style="background:white;border-radius:10px;padding:28px;">
              <h2 style="color:#1e1b4b;margin-top:0;">مرحباً!</h2>
              <p style="color:#4b5563;line-height:1.6;">تمت دعوتك للانضمام إلى منصة <strong>DataChat</strong> — المحلل الذكي للبيانات.</p>
              <p style="color:#4b5563;line-height:1.6;">انقر على الزر أدناه لإنشاء حسابك. هذا الرابط صالح لمدة <strong>48 ساعة</strong>.</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${inviteLink}" style="background:#7c3aed;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">إنشاء الحساب</a>
              </div>
              <p style="color:#9ca3af;font-size:12px;margin-bottom:0;">أو انسخ هذا الرابط في المتصفح:<br/><span style="color:#7c3aed;word-break:break-all;">${inviteLink}</span></p>
            </div>
          </div>
        `
      })
      res.json({ message: 'تم إرسال الدعوة إلى ' + email })
    } else {
      res.json({ inviteLink, message: 'تم إنشاء رابط الدعوة (لم يتم إعداد البريد الإلكتروني)' })
    }
  } catch (err) {
    console.error('Invite error:', err.message)
    res.status(500).json({ error: 'فشل إرسال الدعوة: ' + err.message })
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
    const row = result.rows[0] || {}
    // mask the api key — only send whether it's set, not the actual value
    res.json({
      ...row,
      api_key: row.api_key ? '••••••••••••••••••••••••••••••••••••••' : '',
      has_api_key: !!row.api_key
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/settings', async (req, res) => {
  try {
    const { system_prompt, temperature, model, api_key } = req.body
    if (api_key !== undefined && api_key !== '••••••••••••••••••••••••••••••••••••••') {
      await db.query(
        'UPDATE ai_settings SET system_prompt=$1, temperature=$2, model=$3, api_key=$4, updated_at=NOW() WHERE id=1',
        [system_prompt, temperature, model, api_key || null]
      )
    } else {
      await db.query(
        'UPDATE ai_settings SET system_prompt=$1, temperature=$2, model=$3, updated_at=NOW() WHERE id=1',
        [system_prompt, temperature, model]
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/settings/test-api', async (req, res) => {
  try {
    const { api_key } = req.body
    let keyToTest = api_key
    // if masked value sent, use the stored key
    if (!api_key || api_key.includes('•')) {
      const result = await db.query('SELECT api_key FROM ai_settings WHERE id=1')
      keyToTest = result.rows[0]?.api_key || process.env.GEMINI_API_KEY
    }
    if (!keyToTest) return res.status(400).json({ error: 'لم يتم إدخال مفتاح API' })
    const { GoogleGenerativeAI } = require('@google/generative-ai')
    const testAI = new GoogleGenerativeAI(keyToTest)
    const model = testAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent('قل "مرحبا" فقط')
    const text = result.response.text()
    if (text) {
      res.json({ success: true, message: 'مفتاح API صحيح ويعمل بشكل جيد ✓' })
    } else {
      res.status(400).json({ error: 'المفتاح لا يعمل بشكل صحيح' })
    }
  } catch (err) {
    const msg = err.message || ''
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      res.status(400).json({ error: 'مفتاح API غير صحيح' })
    } else if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      res.status(400).json({ error: 'تم استنفاد حصة API' })
    } else {
      res.status(400).json({ error: 'فشل التحقق: ' + msg })
    }
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

// Email settings routes
router.get('/email-settings', async (req, res) => {
  try {
    const result = await db.query('SELECT smtp_user, smtp_pass FROM email_settings WHERE id=1')
    const row = result.rows[0] || {}
    res.json({
      smtp_user: row.smtp_user || process.env.SMTP_USER || '',
      smtp_pass: row.smtp_pass ? '••••••••••••••••' : (process.env.SMTP_PASS ? '••••••••••••••••' : ''),
      has_smtp: !!(row.smtp_user || process.env.SMTP_USER)
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/email-settings', async (req, res) => {
  try {
    const { smtp_user, smtp_pass } = req.body
    const MASK = '••••••••••••••••'
    if (smtp_pass && smtp_pass !== MASK) {
      await db.query('UPDATE email_settings SET smtp_user=$1, smtp_pass=$2, updated_at=NOW() WHERE id=1', [smtp_user, smtp_pass])
    } else {
      await db.query('UPDATE email_settings SET smtp_user=$1, updated_at=NOW() WHERE id=1', [smtp_user])
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/email-settings/test', async (req, res) => {
  try {
    const { smtp_user, smtp_pass } = req.body
    const MASK = '••••••••••••••••'
    let user = smtp_user
    let pass = smtp_pass
    if (!pass || pass === MASK) {
      const row = await db.query('SELECT smtp_user, smtp_pass FROM email_settings WHERE id=1')
      user = row.rows[0]?.smtp_user || process.env.SMTP_USER
      pass = row.rows[0]?.smtp_pass || process.env.SMTP_PASS
    }
    if (!user || !pass) return res.status(400).json({ error: 'يرجى إدخال بيانات Gmail أولاً' })
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
    await transport.verify()
    res.json({ success: true, message: 'الاتصال بـ Gmail يعمل بشكل صحيح ✓' })
  } catch (err) {
    const msg = err.message || ''
    if (msg.includes('Invalid login') || msg.includes('Username and Password') || msg.includes('credentials')) {
      res.status(400).json({ error: 'بيانات الدخول غير صحيحة — تأكد من استخدام App Password' })
    } else if (msg.includes('ENOTFOUND') || msg.includes('network')) {
      res.status(400).json({ error: 'تعذّر الاتصال بـ Gmail — تحقق من الاتصال بالإنترنت' })
    } else {
      res.status(400).json({ error: 'فشل الاتصال: ' + msg })
    }
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
