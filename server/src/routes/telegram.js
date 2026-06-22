const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { authenticate, JWT_SECRET } = require('../middleware/auth')
const jwt = require('jsonwebtoken')
const axios = require('axios')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

// ── Telegram Bot API helper ──────────────────────────────────────────────────
async function tg(token, method, data = {}) {
  try {
    return await axios.post(`https://api.telegram.org/bot${token}/${method}`, data, {
      timeout: 30000,
      validateStatus: null
    })
  } catch (e) {
    console.error(`[Telegram] API call ${method} failed:`, e.message)
    return { data: { ok: false, description: e.message } }
  }
}

async function sendMessage(token, chatId, text, extra = {}) {
  const safeText = (text || '').substring(0, 4000)
  return tg(token, 'sendMessage', { chat_id: chatId, text: safeText, parse_mode: 'HTML', ...extra })
}

async function sendTyping(token, chatId) {
  return tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
}

async function sendDocument(token, chatId, filePath, caption) {
  try {
    const { Blob } = require('buffer')
    const fileBuffer = fs.readFileSync(filePath)
    const fileName = path.basename(filePath)
    // Use native FormData (Node 18+)
    const form = new FormData()
    form.append('chat_id', String(chatId))
    const blob = new Blob([fileBuffer])
    form.append('document', blob, fileName)
    if (caption) form.append('caption', caption.substring(0, 200))
    return await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form
    })
  } catch (e) {
    console.error('[Telegram] sendDocument error:', e.message)
  }
}

// ── Markdown to Telegram HTML converter ──────────────────────────────────────
function mdToHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/gs, '<b>$1</b>')
    .replace(/\*(.*?)\*/gs, '<i>$1</i>')
    .replace(/`{3}[\w]*\n?([\s\S]*?)`{3}/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#{1,6}\s(.+)$/gm, '<b>$1</b>')
}

// ── Split long messages ────────────────────────────────────────────────────
function splitMessage(text, maxLen = 3800) {
  if (text.length <= maxLen) return [text]
  const chunks = []
  const paragraphs = text.split('\n\n')
  let current = ''
  for (const p of paragraphs) {
    const candidate = current ? current + '\n\n' + p : p
    if (candidate.length > maxLen) {
      if (current) chunks.push(current)
      current = p.length > maxLen ? p.substring(0, maxLen) : p
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}

// ── GET /api/telegram/settings ────────────────────────────────────────────
router.get('/settings', authenticate, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM telegram_settings WHERE user_id=$1', [req.user.id])
    if (!r.rows.length) return res.json({ connected: false })
    const s = r.rows[0]
    const masked = s.bot_token
      ? s.bot_token.substring(0, 8) + '...' + s.bot_token.slice(-4)
      : null
    res.json({
      connected: s.is_active,
      bot_token_masked: masked,
      bot_username: s.bot_username,
      active_project_id: s.active_project_id,
      connected_at: s.connected_at,
      webhook_url: s.webhook_url
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/telegram/connect ────────────────────────────────────────────
router.post('/connect', authenticate, async (req, res) => {
  try {
    const { bot_token, active_project_id } = req.body
    if (!bot_token || bot_token.trim().length < 20) {
      return res.status(400).json({ error: 'توكن البوت مطلوب وغير صحيح' })
    }

    // Verify token with Telegram
    const meRes = await tg(bot_token.trim(), 'getMe')
    if (!meRes.data?.ok) {
      return res.status(400).json({
        error: 'توكن البوت غير صحيح — تأكد من النسخ الصحيح من @BotFather'
      })
    }
    const botInfo = meRes.data.result

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex')

    // Build webhook URL
    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `${req.protocol}://${req.get('host')}`
    const webhookUrl = `${baseUrl}/api/telegram/webhook/${req.user.id}/${webhookSecret}`

    // Remove old webhook first
    await tg(bot_token.trim(), 'deleteWebhook')

    // Register new webhook
    const whRes = await tg(bot_token.trim(), 'setWebhook', {
      url: webhookUrl,
      allowed_updates: ['message'],
      drop_pending_updates: true
    })
    if (!whRes.data?.ok) {
      return res.status(400).json({
        error: `فشل تسجيل الـ webhook: ${whRes.data?.description || 'خطأ غير معروف'}`
      })
    }

    // Upsert into DB
    await db.query(`
      INSERT INTO telegram_settings
        (user_id, bot_token, bot_username, webhook_secret, webhook_url, active_project_id, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,true)
      ON CONFLICT (user_id) DO UPDATE SET
        bot_token=$2, bot_username=$3, webhook_secret=$4, webhook_url=$5,
        active_project_id=$6, is_active=true, updated_at=NOW()
    `, [req.user.id, bot_token.trim(), botInfo.username, webhookSecret, webhookUrl, active_project_id || null])

    // Send welcome message to test (skipped — user initiates first)
    res.json({
      success: true,
      bot_username: botInfo.username,
      bot_name: botInfo.first_name,
      webhook_url: webhookUrl,
      message: `تم الربط بنجاح مع بوت @${botInfo.username} 🎉`
    })
  } catch (err) {
    console.error('[Telegram] Connect error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/telegram/project ────────────────────────────────────────────
router.patch('/project', authenticate, async (req, res) => {
  try {
    const { project_id } = req.body
    if (!project_id) return res.status(400).json({ error: 'project_id required' })
    // Verify project belongs to user
    const p = await db.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [project_id, req.user.id])
    if (!p.rows.length) return res.status(404).json({ error: 'Project not found' })
    await db.query(
      'UPDATE telegram_settings SET active_project_id=$1, updated_at=NOW() WHERE user_id=$2',
      [project_id, req.user.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/telegram/disconnect ───────────────────────────────────────
router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    const s = await db.query('SELECT bot_token FROM telegram_settings WHERE user_id=$1', [req.user.id])
    if (s.rows.length) {
      await tg(s.rows[0].bot_token, 'deleteWebhook')
    }
    await db.query('DELETE FROM telegram_settings WHERE user_id=$1', [req.user.id])
    await db.query('DELETE FROM telegram_chats WHERE user_id=$1', [req.user.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/telegram/projects ────────────────────────────────────────────
router.get('/projects', authenticate, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id, name, pinned FROM projects WHERE user_id=$1 ORDER BY pinned DESC, created_at DESC',
      [req.user.id]
    )
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/telegram/webhook/:userId/:secret ────────────────────────────
// No authentication — called by Telegram servers
router.post('/webhook/:userId/:secret', express.json(), async (req, res) => {
  // Always respond 200 immediately so Telegram doesn't retry
  res.sendStatus(200)

  try {
    const { userId, secret } = req.params
    const update = req.body

    // Verify user and secret
    const settingsRes = await db.query(
      'SELECT * FROM telegram_settings WHERE user_id=$1 AND webhook_secret=$2 AND is_active=true',
      [userId, secret]
    )
    if (!settingsRes.rows.length) return
    const settings = settingsRes.rows[0]

    // Get user from DB
    const userRes = await db.query('SELECT * FROM users WHERE id=$1 AND is_active=true', [userId])
    if (!userRes.rows.length) return
    const user = userRes.rows[0]

    const message = update.message
    if (!message) return

    const chatId = message.chat.id
    const token = settings.bot_token
    const text = (message.text || '').trim()

    // ── Commands ──────────────────────────────────────────────────────────

    if (text === '/start' || text.startsWith('/start ')) {
      const pRes = settings.active_project_id
        ? await db.query('SELECT name FROM projects WHERE id=$1', [settings.active_project_id])
        : { rows: [] }
      const pName = pRes.rows[0]?.name || 'لم يتم تحديد مشروع بعد'
      await sendMessage(token, chatId,
        `👋 أهلاً بك في <b>DataChat</b>!\n\n` +
        `🤖 أنا مساعدك الذكي لتحليل البيانات\n` +
        `📊 المشروع الحالي: <b>${pName}</b>\n\n` +
        `<b>الأوامر المتاحة:</b>\n` +
        `• /projects — عرض جميع مشاريعك\n` +
        `• /project <i>اسم</i> — تبديل المشروع النشط\n` +
        `• /newproject <i>اسم</i> — إنشاء مشروع جديد\n` +
        `• /files — عرض ملفات المشروع الحالي\n` +
        `• /clear — مسح سجل المحادثة\n` +
        `• /help — قائمة المساعدة\n\n` +
        `💡 أرسل سؤالاً أو أرفق ملفاً للتحليل الفوري 📎`
      )
      return
    }

    if (text === '/help') {
      await sendMessage(token, chatId,
        `📚 <b>المساعدة — DataChat Bot</b>\n\n` +
        `<b>الأوامر:</b>\n` +
        `• <code>/start</code> — الشاشة الرئيسية\n` +
        `• <code>/projects</code> — عرض مشاريعك\n` +
        `• <code>/project اسم</code> — تبديل المشروع\n` +
        `• <code>/newproject اسم</code> — إنشاء مشروع\n` +
        `• <code>/files</code> — ملفات المشروع الحالي\n` +
        `• <code>/clear</code> — مسح المحادثة\n\n` +
        `<b>الملفات المدعومة:</b>\n` +
        `📊 Excel, CSV — 📄 PDF, Word — 📝 TXT, JSON\n\n` +
        `<b>أمثلة على الأسئلة:</b>\n` +
        `• "ما ملخص هذا الملف؟"\n` +
        `• "اعرض أعلى 5 قيم في العمود الأول"\n` +
        `• "أنشئ تقرير Excel بالنتائج"\n` +
        `• "ما المتوسط الحسابي للمبيعات؟"`
      )
      return
    }

    if (text === '/projects') {
      const projects = await db.query(
        'SELECT id, name, pinned FROM projects WHERE user_id=$1 ORDER BY pinned DESC, created_at DESC LIMIT 20',
        [userId]
      )
      if (!projects.rows.length) {
        await sendMessage(token, chatId,
          '📂 لا توجد مشاريع بعد.\n\nأنشئ مشروعاً: <code>/newproject اسم_المشروع</code>'
        )
        return
      }
      let msg = '📂 <b>مشاريعك:</b>\n\n'
      projects.rows.forEach(p => {
        const active = p.id === settings.active_project_id ? ' ✅' : ''
        const pin = p.pinned ? '📌 ' : ''
        msg += `${pin}• <code>/project ${p.name}</code>${active}\n`
      })
      msg += '\n<i>اكتب /project ثم اسم المشروع للتبديل</i>'
      await sendMessage(token, chatId, msg)
      return
    }

    if (text.startsWith('/project ') || (text.startsWith('/project') && text.length > 8)) {
      const pName = text.replace(/^\/project\s*/, '').trim()
      if (!pName) {
        await sendMessage(token, chatId, 'اكتب اسم المشروع: <code>/project اسم_المشروع</code>')
        return
      }
      const proj = await db.query(
        'SELECT id, name FROM projects WHERE user_id=$1 AND name ILIKE $2 LIMIT 1',
        [userId, `%${pName}%`]
      )
      if (!proj.rows.length) {
        await sendMessage(token, chatId,
          `❌ لم يتم العثور على مشروع يحتوي "<b>${pName}</b>"\n\nاستخدم /projects لعرض المشاريع.`
        )
        return
      }
      const found = proj.rows[0]
      await db.query(
        'UPDATE telegram_settings SET active_project_id=$1, updated_at=NOW() WHERE user_id=$2',
        [found.id, userId]
      )
      settings.active_project_id = found.id
      // Reset chat session so new conversation starts
      await db.query(
        'DELETE FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2',
        [userId, chatId]
      )
      await sendMessage(token, chatId,
        `✅ تم التبديل إلى مشروع <b>${found.name}</b>\n\nابدأ المحادثة أو أرسل ملفاً للتحليل 🚀`
      )
      return
    }

    if (text.startsWith('/newproject ') || (text.startsWith('/newproject') && text.length > 11)) {
      const pName = text.replace(/^\/newproject\s*/, '').trim()
      if (!pName) {
        await sendMessage(token, chatId, 'اكتب اسم المشروع: <code>/newproject اسم_المشروع</code>')
        return
      }
      // Check limit
      const count = await db.query('SELECT COUNT(*) FROM projects WHERE user_id=$1', [userId])
      if (parseInt(count.rows[0].count) >= 50) {
        await sendMessage(token, chatId, '⚠️ وصلت إلى الحد الأقصى للمشاريع.')
        return
      }
      const proj = await db.query(
        'INSERT INTO projects (user_id, name) VALUES ($1,$2) RETURNING id, name',
        [userId, pName]
      )
      const newProj = proj.rows[0]
      await db.query(
        'UPDATE telegram_settings SET active_project_id=$1, updated_at=NOW() WHERE user_id=$2',
        [newProj.id, userId]
      )
      settings.active_project_id = newProj.id
      await db.query('DELETE FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2', [userId, chatId])
      await sendMessage(token, chatId,
        `✅ تم إنشاء مشروع <b>${newProj.name}</b> بنجاح!\n\nأرسل ملفات للتحليل أو ابدأ المحادثة مباشرة 📊`
      )
      return
    }

    if (text === '/files') {
      const pid = settings.active_project_id
      if (!pid) {
        await sendMessage(token, chatId,
          '⚠️ لم يتم تحديد مشروع.\nاستخدم /projects للاختيار أو /newproject لإنشاء مشروع.'
        )
        return
      }
      const files = await db.query(
        `SELECT original_name, display_name, file_type, file_size
         FROM files WHERE project_id=$1 ORDER BY sort_order, created_at`,
        [pid]
      )
      const genFiles = await db.query(
        `SELECT original_name, display_name, file_type, file_size
         FROM generated_files WHERE project_id=$1 ORDER BY created_at DESC LIMIT 5`,
        [pid]
      )
      if (!files.rows.length && !genFiles.rows.length) {
        await sendMessage(token, chatId,
          '📭 لا توجد ملفات في هذا المشروع.\n\nأرسل ملفاً (Excel, CSV, PDF, Word) لإضافته.'
        )
        return
      }
      let msg = '📁 <b>ملفات المشروع:</b>\n\n'
      if (files.rows.length) {
        files.rows.forEach((f, i) => {
          const name = f.display_name || f.original_name
          const sz = f.file_size > 1048576
            ? `${(f.file_size / 1048576).toFixed(1)}MB`
            : `${Math.round(f.file_size / 1024)}KB`
          msg += `${i + 1}. 📄 ${name} <i>(${f.file_type.toUpperCase()}, ${sz})</i>\n`
        })
      }
      if (genFiles.rows.length) {
        msg += '\n<b>ملفات مُولَّدة (AI):</b>\n'
        genFiles.rows.forEach((f, i) => {
          const name = f.display_name || f.original_name
          msg += `${i + 1}. ✨ ${name}\n`
        })
      }
      await sendMessage(token, chatId, msg)
      return
    }

    if (text === '/clear') {
      await db.query('DELETE FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2', [userId, chatId])
      await sendMessage(token, chatId,
        '🗑️ تم مسح سجل المحادثة.\n\nابدأ محادثة جديدة أو اسأل سؤالاً جديداً.'
      )
      return
    }

    // Unknown command
    if (text.startsWith('/')) {
      await sendMessage(token, chatId,
        '❓ أمر غير معروف. اكتب /help لعرض قائمة الأوامر.'
      )
      return
    }

    // ── File Upload ───────────────────────────────────────────────────────
    if (message.document) {
      if (!settings.active_project_id) {
        await sendMessage(token, chatId,
          '⚠️ يرجى تحديد مشروع أولاً: /projects'
        )
        return
      }

      await sendTyping(token, chatId)
      const doc = message.document
      const fileName = doc.file_name || `file_${Date.now()}`
      const fileExt = path.extname(fileName).toLowerCase().replace('.', '')
      const supported = ['csv', 'xlsx', 'xls', 'pdf', 'docx', 'doc', 'txt', 'json', 'html']

      if (!supported.includes(fileExt)) {
        await sendMessage(token, chatId,
          `❌ نوع الملف <b>.${fileExt}</b> غير مدعوم.\n\nالأنواع المدعومة: ${supported.join(', ')}`
        )
        return
      }

      // Check project file limit
      const cnt = await db.query('SELECT COUNT(*) FROM files WHERE project_id=$1', [settings.active_project_id])
      if (parseInt(cnt.rows[0].count) >= 10) {
        await sendMessage(token, chatId,
          '❌ وصل المشروع للحد الأقصى (10 ملفات).\n\nاحذف ملفاً من التطبيق أولاً ثم أعد المحاولة.'
        )
        return
      }

      // Get file download path from Telegram
      const fileInfoRes = await tg(token, 'getFile', { file_id: doc.file_id })
      if (!fileInfoRes.data?.ok) {
        await sendMessage(token, chatId, '❌ فشل الحصول على معلومات الملف.')
        return
      }
      const tgFilePath = fileInfoRes.data.result.file_path
      const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`

      // Download file
      const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
      const fileBuffer = Buffer.from(fileRes.data)

      // Save to uploads folder
      const storedName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${fileExt}`
      const uploadPath = path.join(__dirname, '../../../uploads', storedName)
      fs.writeFileSync(uploadPath, fileBuffer)

      // Save to DB
      await db.query(
        'INSERT INTO files (project_id, original_name, stored_name, file_type, file_size, mime_type) VALUES ($1,$2,$3,$4,$5,$6)',
        [settings.active_project_id, fileName, storedName, fileExt, fileBuffer.length, doc.mime_type || 'application/octet-stream']
      )

      await sendMessage(token, chatId,
        `✅ تم رفع الملف <b>${fileName}</b> بنجاح!\n\n` +
        `الحجم: ${(fileBuffer.length / 1024).toFixed(1)} KB\n\n` +
        `💬 الآن اسأل عنه:\n` +
        `• "ما ملخص هذا الملف؟"\n` +
        `• "أنشئ تقريراً Excel بالنتائج"\n` +
        `• "ما هي أهم الأرقام في الملف؟"`
      )
      return
    }

    // ── AI Chat (regular text message) ───────────────────────────────────
    if (!text) return

    if (!settings.active_project_id) {
      await sendMessage(token, chatId,
        '⚠️ لم يتم تحديد مشروع بعد.\n\n' +
        'استخدم /projects لعرض مشاريعك أو /newproject اسم لإنشاء مشروع جديد.'
      )
      return
    }

    // Get or create telegram chat session
    let sessionRes = await db.query(
      'SELECT * FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2',
      [userId, chatId]
    )

    let conversationId
    if (!sessionRes.rows.length || sessionRes.rows[0].active_project_id !== settings.active_project_id) {
      // New conversation
      const convRes = await db.query(
        'INSERT INTO conversations (project_id) VALUES ($1) RETURNING id',
        [settings.active_project_id]
      )
      conversationId = convRes.rows[0].id
      await db.query(`
        INSERT INTO telegram_chats (user_id, telegram_chat_id, active_project_id, conversation_id)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id, telegram_chat_id) DO UPDATE SET
          active_project_id=$3, conversation_id=$4
      `, [userId, chatId, settings.active_project_id, conversationId])
    } else {
      conversationId = sessionRes.rows[0].conversation_id
    }

    // Send typing indicator
    await sendTyping(token, chatId)

    // Generate internal JWT token
    const internalToken = jwt.sign(
      { id: parseInt(userId), role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    )

    // Call AI via internal HTTP (SSE) and collect response
    let fullResponse = ''
    let generatedFile = null

    try {
      const chatRes = await axios.post(
        `http://localhost:${process.env.PORT || 3001}/api/chat/${settings.active_project_id}/message`,
        { message: text, conversationId },
        {
          headers: {
            Authorization: `Bearer ${internalToken}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          responseType: 'stream',
          timeout: 120000
        }
      )

      // Parse SSE stream
      await new Promise((resolve, reject) => {
        let buffer = ''
        chatRes.data.on('data', chunk => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop()
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'text') fullResponse += data.content
                if (data.type === 'done') generatedFile = data.generatedFile
                if (data.type === 'error') fullResponse = `⚠️ ${data.content}`
              } catch {}
            }
          }
        })
        chatRes.data.on('end', resolve)
        chatRes.data.on('error', reject)
      })
    } catch (aiErr) {
      console.error('[Telegram] AI call error:', aiErr.message)
      await sendMessage(token, chatId,
        '❌ حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.'
      )
      return
    }

    // Send AI response
    if (fullResponse) {
      const htmlText = mdToHtml(fullResponse)
      const chunks = splitMessage(htmlText)
      for (let i = 0; i < chunks.length; i++) {
        await sendMessage(token, chatId, chunks[i])
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 400))
      }
    }

    // Send generated file if any
    if (generatedFile) {
      const genPath = path.join(__dirname, '../../../uploads/generated', generatedFile.stored_name)
      if (fs.existsSync(genPath)) {
        await sendDocument(
          token,
          chatId,
          genPath,
          `✨ ${generatedFile.original_name || generatedFile.stored_name}`
        )
      }
    }

  } catch (err) {
    console.error('[Telegram] Webhook error:', err.message)
  }
})

module.exports = router
