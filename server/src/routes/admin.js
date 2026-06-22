const express = require('express')
const path = require('path')
const fs = require('fs')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const nodemailer = require('nodemailer')
const db = require('../lib/db')
const { authenticate, adminOnly } = require('../middleware/auth')

const UPLOADS_DIR = path.join(__dirname, '../../../uploads')

function padId(id) {
  return String(id).padStart(4, '0')
}

function deleteUserDir(userId) {
  try {
    // New professional path: users/user_0001/
    const newDir = path.join(UPLOADS_DIR, 'users', `user_${padId(userId)}`)
    if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true })
    // Legacy numeric path: users/1/  (backward compatibility)
    const legacyDir = path.join(UPLOADS_DIR, 'users', String(userId))
    if (fs.existsSync(legacyDir)) fs.rmSync(legacyDir, { recursive: true, force: true })
  } catch (e) {
    console.error('Error deleting user dir:', e.message)
  }
}

async function deleteUserFiles(userId) {
  try {
    // Delete all generated files belonging to the user's projects
    // (uploaded files are covered by deleteUserDir which removes the whole user folder)
    const genRes = await db.query(
      'SELECT gf.stored_name FROM generated_files gf JOIN projects p ON p.id=gf.project_id WHERE p.user_id=$1',
      [userId]
    )
    for (const f of genRes.rows) {
      const p = path.join(UPLOADS_DIR, 'generated', f.stored_name)
      if (fs.existsSync(p)) fs.unlink(p, () => {})
    }
    // Also clean up any legacy flat-stored uploaded files
    const filesRes = await db.query(
      'SELECT f.stored_name FROM files f JOIN projects p ON p.id=f.project_id WHERE p.user_id=$1',
      [userId]
    )
    for (const f of filesRes.rows) {
      const flatPath = path.join(UPLOADS_DIR, f.stored_name)
      if (fs.existsSync(flatPath)) fs.unlink(flatPath, () => {})
    }
  } catch (e) {
    console.error('Error deleting user files:', e.message)
  }
}

async function getMailer() {
  const result = await db.query('SELECT smtp_user, smtp_pass FROM email_settings WHERE id=1').catch(() => ({ rows: [] }))
  const row = result.rows[0] || {}
  const user = row.smtp_user
  const pass = row.smtp_pass
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

const router = express.Router()
router.use(authenticate, adminOnly)

router.get('/stats', async (req, res) => {
  try {
    const [users, projects, genFiles, messages] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE last_seen_at > NOW() - INTERVAL '15 minutes'"),
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
    const origin = req.headers.origin
      || (req.headers.referer ? new URL(req.headers.referer).origin : null)
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:5000`)
    const inviteLink = `${origin}/register?token=${token}`

    const mailer = await getMailer()
    if (mailer) {
      const smtpRow = await db.query('SELECT smtp_user FROM email_settings WHERE id=1')
      const smtpUser = smtpRow.rows[0]?.smtp_user || ''
      await mailer.sendMail({
        from: `"DataChat" <${smtpUser}>`,
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

router.patch('/users/:id', async (req, res) => {
  try {
    const { name, email, role, is_active, newPassword } = req.body
    const { id } = req.params
    const check = await db.query('SELECT * FROM users WHERE id=$1', [id])
    if (!check.rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' })
    // Prevent demoting the only admin
    if (check.rows[0].role === 'admin' && role === 'employee') {
      const admins = await db.query("SELECT COUNT(*) FROM users WHERE role='admin'")
      if (parseInt(admins.rows[0].count) <= 1) return res.status(400).json({ error: 'لا يمكن تغيير دور المدير الوحيد' })
    }
    // Check email uniqueness if changed
    if (email && email !== check.rows[0].email) {
      const exists = await db.query('SELECT id FROM users WHERE email=$1 AND id!=$2', [email, id])
      if (exists.rows.length) return res.status(400).json({ error: 'البريد الإلكتروني مستخدَم بالفعل' })
    }
    if (newPassword) {
      if (newPassword.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
      const hash = await bcrypt.hash(newPassword, 12)
      await db.query(
        'UPDATE users SET name=$1, email=$2, role=$3, is_active=$4, password_hash=$5 WHERE id=$6',
        [name, email, role, is_active, hash, id]
      )
    } else {
      await db.query(
        'UPDATE users SET name=$1, email=$2, role=$3, is_active=$4 WHERE id=$5',
        [name, email, role, is_active, id]
      )
    }
    const updated = await db.query('SELECT id, name, email, role, is_active FROM users WHERE id=$1', [id])
    res.json(updated.rows[0])
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
    const userId = parseInt(req.params.id)
    // Clean up disk files before DB cascade-delete removes the records
    await deleteUserFiles(userId)
    await db.query('DELETE FROM users WHERE id=$1', [userId])
    // Delete the user's entire uploads directory
    deleteUserDir(userId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/settings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_settings WHERE id=1')
    const row = result.rows[0] || {}
    res.json({
      ...row,
      api_key: row.api_key ? '••••••••••••••••••••••••••••••••••••••' : '',
      has_api_key: !!row.api_key,
      provider: row.provider || 'gemini',
      proxy_url: row.proxy_url || ''
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/settings', async (req, res) => {
  try {
    const { system_prompt, temperature, model, api_key, provider, proxy_url } = req.body
    if (api_key !== undefined && api_key !== '••••••••••••••••••••••••••••••••••••••') {
      await db.query(
        'UPDATE ai_settings SET system_prompt=$1, temperature=$2, model=$3, api_key=$4, provider=$5, proxy_url=$6, updated_at=NOW() WHERE id=1',
        [system_prompt, temperature, model, api_key || null, provider || 'gemini', proxy_url || null]
      )
    } else {
      await db.query(
        'UPDATE ai_settings SET system_prompt=$1, temperature=$2, model=$3, provider=$4, proxy_url=$5, updated_at=NOW() WHERE id=1',
        [system_prompt, temperature, model, provider || 'gemini', proxy_url || null]
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/settings/test-api', async (req, res) => {
  try {
    const { api_key, provider, model: reqModel, proxy_url } = req.body
    let keyToTest = api_key
    // if masked value sent, use the stored key
    if (!api_key || api_key.includes('•')) {
      const result = await db.query('SELECT api_key, proxy_url FROM ai_settings WHERE id=1')
      keyToTest = result.rows[0]?.api_key
    }
    if (!keyToTest) keyToTest = process.env.GEMINI_API_KEY
    if (!keyToTest) return res.status(400).json({ error: 'لم يتم إدخال مفتاح API' })

    if (provider === 'openai') {
      const baseUrl = (proxy_url && proxy_url.trim()) || 'https://api.openai.com/v1'
      const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
      const testModel = reqModel || 'gpt-4o-mini'
      const testRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyToTest}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ model: testModel, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: AbortSignal.timeout(15000)
      })
      if (testRes.ok) {
        return res.json({ success: true, message: 'مفتاح OpenAI API صحيح ويعمل بشكل جيد ✓' })
      }
      const errText = await testRes.text()
      let errMsg = ''
      try { errMsg = JSON.parse(errText)?.error?.message || JSON.parse(errText)?.message || '' } catch {}
      if (testRes.status === 401) return res.status(400).json({ error: 'مفتاح OpenAI غير صحيح أو منتهي الصلاحية' + (errMsg ? `: ${errMsg}` : '') })
      if (testRes.status === 403) return res.status(400).json({ error: 'الوصول مرفوض — تحقق من صلاحيات المفتاح' + (errMsg ? `: ${errMsg}` : '') })
      if (testRes.status === 404) return res.status(400).json({ error: `النموذج "${testModel}" غير موجود — تحقق من اسمه` })
      if (testRes.status === 429) return res.status(400).json({ error: 'تم استنفاد حصة OpenAI API — حاول لاحقاً' })
      return res.status(400).json({ error: `فشل التحقق (${testRes.status}): ${(errMsg || errText).substring(0, 200)}` })
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai')
    const testAI = new GoogleGenerativeAI(keyToTest)
    const model = testAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent('قل "مرحبا" فقط')
    const text = result.response.text()
    if (text) {
      res.json({ success: true, message: 'مفتاح Gemini API صحيح ويعمل بشكل جيد ✓' })
    } else {
      res.status(400).json({ error: 'المفتاح لا يعمل بشكل صحيح' })
    }
  } catch (err) {
    const msg = err.message || ''
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      res.status(400).json({ error: 'مفتاح API غير صحيح' })
    } else if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      res.status(400).json({ error: 'تم استنفاد حصة API' })
    } else if (msg.includes('TimeoutError') || msg.includes('timeout') || msg.includes('abort')) {
      res.status(400).json({ error: 'انتهت مهلة الاتصال — تحقق من الرابط وصحة المفتاح' })
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
    const userId = req.user.id
    await deleteUserFiles(userId)
    await db.query('DELETE FROM users WHERE id=$1', [userId])
    deleteUserDir(userId)
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
      smtp_user: row.smtp_user || '',
      smtp_pass: row.smtp_pass ? '••••••••••••••••' : '',
      has_smtp: !!(row.smtp_user && row.smtp_pass)
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
      user = row.rows[0]?.smtp_user
      pass = row.rows[0]?.smtp_pass
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
