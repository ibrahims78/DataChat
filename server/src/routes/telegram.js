const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { authenticate, JWT_SECRET } = require('../middleware/auth')
const jwt = require('jsonwebtoken')
const axios = require('axios')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// ── Utility ───────────────────────────────────────────────────────────────────
function padId(id) { return String(id).padStart(4, '0') }

function formatSize(bytes) {
  if (!bytes) return '?KB'
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`
}

function fileEmoji(fileType) {
  const map = { excel: '📊', csv: '📊', pdf: '📄', word: '📝', image: '🖼', markdown: '📋', text: '📋', json: '🔧', html: '🌐' }
  return map[fileType] || '📎'
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = {
    '.xlsx': 'excel', '.xlsm': 'excel', '.xls': 'excel',
    '.csv': 'csv', '.pdf': 'pdf', '.docx': 'word', '.doc': 'word',
    '.md': 'markdown', '.txt': 'text', '.json': 'json',
    '.html': 'html', '.htm': 'html',
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
    '.gif': 'image', '.webp': 'image'
  }
  return map[ext] || 'unknown'
}

function resolveFilePath(storedName, userId, projectId) {
  const structured = path.join(__dirname, '../../../uploads', 'users', `user_${padId(userId)}`, 'projects', `project_${padId(projectId)}`, storedName)
  if (fs.existsSync(structured)) return structured
  const flat = path.join(__dirname, '../../../uploads', storedName)
  if (fs.existsSync(flat)) return flat
  return null
}

// ── Telegram API helpers ──────────────────────────────────────────────────────
async function tg(token, method, data = {}) {
  try {
    return await axios.post(`https://api.telegram.org/bot${token}/${method}`, data, {
      timeout: 30000, validateStatus: null
    })
  } catch (e) {
    console.error(`[TG] ${method} failed:`, e.message)
    return { data: { ok: false, description: e.message } }
  }
}

async function sendMessage(token, chatId, text, replyMarkup = null) {
  const body = { chat_id: chatId, text: (text || '').substring(0, 4000), parse_mode: 'HTML' }
  if (replyMarkup) body.reply_markup = replyMarkup
  return tg(token, 'sendMessage', body)
}

async function sendTyping(token, chatId) {
  return tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
}

async function sendDocument(token, chatId, filePath, caption) {
  try {
    const { Blob } = require('buffer')
    const fileBuffer = fs.readFileSync(filePath)
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('document', new Blob([fileBuffer]), path.basename(filePath))
    if (caption) form.append('caption', caption.substring(0, 200))
    return await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form })
  } catch (e) { console.error('[TG] sendDocument error:', e.message) }
}

async function answerCallback(token, callbackQueryId, text = '') {
  return tg(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: false })
}

async function editMessage(token, chatId, messageId, text, replyMarkup = null) {
  const body = { chat_id: chatId, message_id: messageId, text: (text || '').substring(0, 4000), parse_mode: 'HTML' }
  if (replyMarkup) body.reply_markup = replyMarkup
  return tg(token, 'editMessageText', body)
}

async function removeKeyboard(token, chatId, messageId) {
  return tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
}

// ── Message helpers ───────────────────────────────────────────────────────────
function mdToHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/gs, '<b>$1</b>')
    .replace(/\*(.*?)\*/gs, '<i>$1</i>')
    .replace(/`{3}[\w]*\n?([\s\S]*?)`{3}/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#{1,6}\s(.+)$/gm, '<b>$1</b>')
}

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
    } else { current = candidate }
  }
  if (current) chunks.push(current)
  return chunks
}

// ── Inline keyboard builders ──────────────────────────────────────────────────
function fileListKeyboard(files, action) {
  return {
    inline_keyboard: files.slice(0, 8).map(f => [{
      text: `${fileEmoji(f.file_type)} ${(f.display_name || f.original_name).substring(0, 35)}`,
      callback_data: `${action}:${f.id}`
    }])
  }
}

function quickActionsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📋 ملخص', callback_data: 'qa:sum' },
        { text: '📈 أبرز الأرقام', callback_data: 'qa:num' },
        { text: '✨ تقرير Excel', callback_data: 'qa:rep' }
      ],
      [
        { text: '🔍 تحليل أعمق', callback_data: 'qa:deep' },
        { text: '📊 إحصاء وصفي', callback_data: 'qa:chart' }
      ]
    ]
  }
}

const QA_PROMPTS = {
  'qa:sum':   'قدّم ملخصاً شاملاً ومنظماً لجميع البيانات والملفات في هذا المشروع.',
  'qa:num':   'اعرض أبرز الأرقام والإحصاءات والقيم المهمة من البيانات بشكل مختصر ومنظم.',
  'qa:rep':   'أنشئ تقرير Excel شامل ومنسق يلخص جميع البيانات المهمة في الملفات.',
  'qa:deep':  'قم بتحليل عميق ومفصل للبيانات: اكشف الأنماط والاتجاهات والاستنتاجات المهمة.',
  'qa:chart': 'اشرح توزيع البيانات والإحصاءات الوصفية (متوسط، وسيط، انحراف، قيم شاذة) لكل عمود.'
}

// ── Core AI helpers ───────────────────────────────────────────────────────────
async function callAI(userId, userRole, projectId, conversationId, message) {
  const internalToken = jwt.sign({ id: parseInt(userId), role: userRole }, JWT_SECRET, { expiresIn: '1h' })
  let fullResponse = '', generatedFile = null
  const chatRes = await axios.post(
    `http://localhost:${process.env.PORT || 3001}/api/chat/${projectId}/message`,
    { message, conversationId },
    {
      headers: { Authorization: `Bearer ${internalToken}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      responseType: 'stream', timeout: 120000
    }
  )
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
            if (data.type === 'error') fullResponse = `⚠️ ${data.content || data.message}`
          } catch {}
        }
      }
    })
    chatRes.data.on('end', resolve)
    chatRes.data.on('error', reject)
  })
  return { fullResponse, generatedFile }
}

async function sendAIResult(token, chatId, fullResponse, generatedFile, withActions = false) {
  if (fullResponse) {
    const chunks = splitMessage(mdToHtml(fullResponse))
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1
      await sendMessage(token, chatId, chunks[i], isLast && withActions ? quickActionsKeyboard() : null)
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 400))
    }
  }
  if (generatedFile) {
    const genPath = path.join(__dirname, '../../../uploads/generated', generatedFile.stored_name)
    if (fs.existsSync(genPath)) {
      await sendDocument(token, chatId, genPath, `✨ ${generatedFile.original_name || generatedFile.stored_name}`)
    }
  }
}

async function getOrCreateConversation(userId, chatId, settings) {
  const sessionRes = await db.query(
    'SELECT * FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2', [userId, chatId]
  )
  if (!sessionRes.rows.length || sessionRes.rows[0].active_project_id !== settings.active_project_id) {
    const convRes = await db.query('INSERT INTO conversations (project_id) VALUES ($1) RETURNING id', [settings.active_project_id])
    const conversationId = convRes.rows[0].id
    await db.query(`
      INSERT INTO telegram_chats (user_id, telegram_chat_id, active_project_id, conversation_id)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id, telegram_chat_id) DO UPDATE SET active_project_id=$3, conversation_id=$4
    `, [userId, chatId, settings.active_project_id, conversationId])
    return conversationId
  }
  return sessionRes.rows[0].conversation_id
}

// ── REST Routes ───────────────────────────────────────────────────────────────

router.get('/settings', authenticate, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM telegram_settings WHERE user_id=$1', [req.user.id])
    if (!r.rows.length) return res.json({ connected: false })
    const s = r.rows[0]
    res.json({
      connected: s.is_active,
      bot_token_masked: s.bot_token ? s.bot_token.substring(0, 8) + '...' + s.bot_token.slice(-4) : null,
      bot_username: s.bot_username,
      active_project_id: s.active_project_id,
      connected_at: s.connected_at,
      webhook_url: s.webhook_url,
      ai_model: s.ai_model || 'gemini-2.5-flash'
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/connect', authenticate, async (req, res) => {
  try {
    const { bot_token, active_project_id } = req.body
    if (!bot_token || bot_token.trim().length < 20)
      return res.status(400).json({ error: 'توكن البوت مطلوب وغير صحيح' })

    const meRes = await tg(bot_token.trim(), 'getMe')
    if (!meRes.data?.ok)
      return res.status(400).json({ error: 'توكن البوت غير صحيح — تأكد من النسخ الصحيح من @BotFather' })

    const botInfo = meRes.data.result
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `${req.protocol}://${req.get('host')}`
    const webhookUrl = `${baseUrl}/api/telegram/webhook/${req.user.id}/${webhookSecret}`

    await tg(bot_token.trim(), 'deleteWebhook')
    const whRes = await tg(bot_token.trim(), 'setWebhook', {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    })
    if (!whRes.data?.ok)
      return res.status(400).json({ error: `فشل تسجيل الـ webhook: ${whRes.data?.description || 'خطأ غير معروف'}` })

    await db.query(`
      INSERT INTO telegram_settings (user_id, bot_token, bot_username, webhook_secret, webhook_url, active_project_id, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,true)
      ON CONFLICT (user_id) DO UPDATE SET
        bot_token=$2, bot_username=$3, webhook_secret=$4, webhook_url=$5,
        active_project_id=$6, is_active=true, updated_at=NOW()
    `, [req.user.id, bot_token.trim(), botInfo.username, webhookSecret, webhookUrl, active_project_id || null])

    res.json({ success: true, bot_username: botInfo.username, webhook_url: webhookUrl, message: `تم الربط بنجاح مع @${botInfo.username} 🎉` })
  } catch (err) {
    console.error('[TG] Connect error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.patch('/project', authenticate, async (req, res) => {
  try {
    const { project_id } = req.body
    if (!project_id) return res.status(400).json({ error: 'project_id required' })
    const p = await db.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [project_id, req.user.id])
    if (!p.rows.length) return res.status(404).json({ error: 'Project not found' })
    await db.query('UPDATE telegram_settings SET active_project_id=$1, updated_at=NOW() WHERE user_id=$2', [project_id, req.user.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    const s = await db.query('SELECT bot_token FROM telegram_settings WHERE user_id=$1', [req.user.id])
    if (s.rows.length) await tg(s.rows[0].bot_token, 'deleteWebhook')
    await db.query('DELETE FROM telegram_settings WHERE user_id=$1', [req.user.id])
    await db.query('DELETE FROM telegram_chats WHERE user_id=$1', [req.user.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/projects', authenticate, async (req, res) => {
  try {
    const r = await db.query('SELECT id, name, pinned FROM projects WHERE user_id=$1 ORDER BY pinned DESC, created_at DESC', [req.user.id])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Webhook ───────────────────────────────────────────────────────────────────
router.post('/webhook/:userId/:secret', express.json(), async (req, res) => {
  res.sendStatus(200)

  try {
    const { userId, secret } = req.params
    const update = req.body

    const settingsRes = await db.query(
      'SELECT * FROM telegram_settings WHERE user_id=$1 AND webhook_secret=$2 AND is_active=true',
      [userId, secret]
    )
    if (!settingsRes.rows.length) return
    const settings = settingsRes.rows[0]

    const userRes = await db.query('SELECT * FROM users WHERE id=$1 AND is_active=true', [userId])
    if (!userRes.rows.length) return
    const user = userRes.rows[0]
    const token = settings.bot_token

    // ══════════════════════════════════════════════════════════════════════════
    // CALLBACK QUERIES (Inline button presses)
    // ══════════════════════════════════════════════════════════════════════════
    if (update.callback_query) {
      const cq = update.callback_query
      const chatId = cq.message.chat.id
      const msgId = cq.message.message_id
      const cbData = cq.data || ''

      await answerCallback(token, cq.id)

      // ── Download uploaded file ─────────────────────────────────────────────
      if (cbData.startsWith('df:')) {
        const fileId = cbData.slice(3)
        const f = await db.query('SELECT f.*, p.user_id as owner_id FROM files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1', [fileId])
        if (!f.rows.length) { await sendMessage(token, chatId, '❌ الملف غير موجود.'); return }
        const file = f.rows[0]
        const actualPath = resolveFilePath(file.stored_name, file.owner_id, file.project_id)
        if (!actualPath) { await sendMessage(token, chatId, '❌ الملف غير موجود على القرص.'); return }
        await removeKeyboard(token, chatId, msgId)
        await sendDocument(token, chatId, actualPath, `📎 ${file.display_name || file.original_name}`)
        return
      }

      // ── Delete uploaded file — show confirmation ───────────────────────────
      if (cbData.startsWith('del:')) {
        const fileId = cbData.slice(4)
        const f = await db.query('SELECT original_name, display_name FROM files WHERE id=$1', [fileId])
        if (!f.rows.length) { await sendMessage(token, chatId, '❌ الملف غير موجود.'); return }
        const name = f.rows[0].display_name || f.rows[0].original_name
        await editMessage(token, chatId, msgId,
          `⚠️ هل تريد حذف الملف <b>${name}</b>؟\n<i>هذا الإجراء لا يمكن التراجع عنه.</i>`,
          { inline_keyboard: [[
            { text: '✅ نعم، احذف', callback_data: `dc:${fileId}` },
            { text: '❌ إلغاء', callback_data: 'cancel' }
          ]]}
        )
        return
      }

      // ── Confirm delete file ────────────────────────────────────────────────
      if (cbData.startsWith('dc:')) {
        const fileId = cbData.slice(3)
        const f = await db.query('SELECT f.*, p.user_id as owner_id FROM files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1', [fileId])
        if (!f.rows.length) { await editMessage(token, chatId, msgId, '❌ الملف غير موجود.'); return }
        const file = f.rows[0]
        const actualPath = resolveFilePath(file.stored_name, file.owner_id, file.project_id)
        if (actualPath) fs.unlink(actualPath, () => {})
        await db.query('DELETE FROM files WHERE id=$1', [fileId])
        await editMessage(token, chatId, msgId, `🗑️ تم حذف الملف <b>${file.display_name || file.original_name}</b> بنجاح.`)
        return
      }

      // ── Download generated file ────────────────────────────────────────────
      if (cbData.startsWith('dg:')) {
        const genId = cbData.slice(3)
        const g = await db.query('SELECT * FROM generated_files WHERE id=$1', [genId])
        if (!g.rows.length) { await sendMessage(token, chatId, '❌ الملف غير موجود.'); return }
        const genPath = path.join(__dirname, '../../../uploads/generated', g.rows[0].stored_name)
        if (!fs.existsSync(genPath)) { await sendMessage(token, chatId, '❌ الملف غير موجود على القرص.'); return }
        await removeKeyboard(token, chatId, msgId)
        await sendDocument(token, chatId, genPath, `✨ ${g.rows[0].display_name || g.rows[0].original_name}`)
        return
      }

      // ── Preview file ───────────────────────────────────────────────────────
      if (cbData.startsWith('pv:')) {
        const fileId = cbData.slice(3)
        const f = await db.query('SELECT f.*, p.user_id as owner_id FROM files f JOIN projects p ON p.id=f.project_id WHERE f.id=$1', [fileId])
        if (!f.rows.length) { await sendMessage(token, chatId, '❌ الملف غير موجود.'); return }
        const file = f.rows[0]
        const actualPath = resolveFilePath(file.stored_name, file.owner_id, file.project_id)
        const name = file.display_name || file.original_name
        let previewText = `${fileEmoji(file.file_type)} <b>${name}</b>\n<i>${(file.file_type || '').toUpperCase()} · ${formatSize(file.file_size)}</i>\n\n`
        try {
          if (!actualPath) throw new Error('الملف غير موجود على القرص')
          const XLSX = require('xlsx')
          const pdfParse = require('pdf-parse')
          const mammoth = require('mammoth')
          if (file.file_type === 'excel') {
            const wb = XLSX.readFile(actualPath)
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            const headers = rows[0] || []
            previewText += `<b>الأعمدة:</b> ${headers.slice(0, 5).join(' | ')}\n`
            previewText += `<b>الصفوف:</b> ${rows.length - 1}\n\n`
            rows.slice(1, 4).forEach((r, i) => { previewText += `${i + 1}. ${r.slice(0, 4).map(String).join(' | ')}\n` })
          } else if (file.file_type === 'csv') {
            const { parse } = require('csv-parse/sync')
            const records = parse(fs.readFileSync(actualPath, 'utf8'), { skip_empty_lines: true })
            previewText += `<b>الأعمدة:</b> ${(records[0] || []).slice(0, 5).join(' | ')}\n<b>الصفوف:</b> ${records.length - 1}`
          } else if (file.file_type === 'pdf') {
            const pdfData = await Promise.race([pdfParse(fs.readFileSync(actualPath)), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))])
            previewText += pdfData.text.substring(0, 400) + (pdfData.text.length > 400 ? '...' : '')
          } else if (file.file_type === 'word') {
            const result = await mammoth.extractRawText({ path: actualPath })
            previewText += result.value.substring(0, 400) + (result.value.length > 400 ? '...' : '')
          } else {
            const content = fs.readFileSync(actualPath, 'utf8')
            previewText += content.substring(0, 400) + (content.length > 400 ? '...' : '')
          }
        } catch (e) { previewText += `<i>تعذّر قراءة المعاينة: ${e.message}</i>` }
        await sendMessage(token, chatId, previewText)
        return
      }

      // ── Quick AI actions ───────────────────────────────────────────────────
      if (cbData.startsWith('qa:') && QA_PROMPTS[cbData]) {
        if (!settings.active_project_id) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
        await sendTyping(token, chatId)
        const conversationId = await getOrCreateConversation(userId, chatId, settings)
        try {
          const { fullResponse, generatedFile } = await callAI(userId, user.role, settings.active_project_id, conversationId, QA_PROMPTS[cbData])
          await sendAIResult(token, chatId, fullResponse, generatedFile, true)
        } catch (e) { await sendMessage(token, chatId, '❌ حدث خطأ في المعالجة.') }
        return
      }

      // ── Switch AI model ────────────────────────────────────────────────────
      if (cbData.startsWith('md:')) {
        const modelMap = { 'md:flash': 'gemini-2.5-flash', 'md:pro': 'gemini-2.5-pro', 'md:lite': 'gemini-2.5-flash-lite' }
        const model = modelMap[cbData]
        if (!model) return
        await db.query('UPDATE telegram_settings SET ai_model=$1 WHERE user_id=$2', [model, userId])
        await db.query(`
          INSERT INTO user_ai_settings (user_id, model) VALUES ($1,$2)
          ON CONFLICT (user_id) DO UPDATE SET model=$2, updated_at=NOW()
        `, [userId, model])
        await editMessage(token, chatId, msgId, `✅ تم التبديل إلى نموذج <b>${model}</b>`)
        return
      }

      // ── Folder delete confirmation ─────────────────────────────────────────
      if (cbData.startsWith('fdc:')) {
        const folderId = cbData.slice(4)
        const folder = await db.query('SELECT * FROM folders WHERE id=$1', [folderId])
        if (!folder.rows.length) { await editMessage(token, chatId, msgId, '❌ المجلد غير موجود.'); return }
        await db.query('UPDATE files SET folder_id=NULL WHERE folder_id=$1', [folderId])
        await db.query('DELETE FROM folders WHERE id=$1', [folderId])
        await editMessage(token, chatId, msgId, `🗑️ تم حذف مجلد <b>${folder.rows[0].name}</b> — الملفات نُقلت لـ "غير مصنف"`)
        return
      }

      // ── Cancel ─────────────────────────────────────────────────────────────
      if (cbData === 'cancel') {
        await editMessage(token, chatId, msgId, '↩️ تم الإلغاء.')
        return
      }

      return
    }

    // ══════════════════════════════════════════════════════════════════════════
    // REGULAR MESSAGES
    // ══════════════════════════════════════════════════════════════════════════
    const message = update.message
    if (!message) return

    const chatId = message.chat.id
    const text = (message.text || '').trim()

    // ── /start ────────────────────────────────────────────────────────────────
    if (text === '/start' || text.startsWith('/start ')) {
      const pRes = settings.active_project_id
        ? await db.query('SELECT name FROM projects WHERE id=$1', [settings.active_project_id])
        : { rows: [] }
      const pName = pRes.rows[0]?.name || 'لم يتم تحديد مشروع'
      const aiModel = settings.ai_model || 'gemini-2.5-flash'
      await sendMessage(token, chatId,
        `👋 أهلاً بك في <b>DataChat</b>!\n\n` +
        `🤖 مساعدك الذكي لتحليل البيانات\n` +
        `📊 المشروع الحالي: <b>${pName}</b>\n` +
        `🧠 النموذج: <b>${aiModel}</b>\n\n` +
        `<b>📁 الملفات:</b> /files · /download · /deletefile · /generated · /preview\n` +
        `<b>📊 المشاريع:</b> /projects · /stats · /export · /search\n` +
        `<b>🤖 AI:</b> /model · /setprompt · /clear\n` +
        `<b>📂 المجلدات:</b> /folders · /newfolder\n\n` +
        `💡 أرسل سؤالاً أو أرفق ملفاً/صورة/رسالة صوتية 📎`
      )
      return
    }

    // ── /help ─────────────────────────────────────────────────────────────────
    if (text === '/help') {
      await sendMessage(token, chatId,
        `📚 <b>المساعدة الكاملة — DataChat Bot</b>\n\n` +
        `<b>📁 إدارة الملفات:</b>\n` +
        `• <code>/files</code> — عرض ملفات المشروع\n` +
        `• <code>/download</code> — تحميل ملف مرفوع\n` +
        `• <code>/deletefile</code> — حذف ملف (مع تأكيد)\n` +
        `• <code>/generated</code> — الملفات المُوَّلدة بـ AI\n` +
        `• <code>/preview</code> — معاينة محتوى ملف\n\n` +
        `<b>📊 المشاريع:</b>\n` +
        `• <code>/projects</code> — عرض مشاريعك\n` +
        `• <code>/project اسم</code> — تبديل المشروع\n` +
        `• <code>/newproject اسم</code> — مشروع جديد\n` +
        `• <code>/stats</code> — إحصاءات المشروع\n\n` +
        `<b>🤖 الذكاء الاصطناعي:</b>\n` +
        `• <code>/model</code> — تبديل نموذج AI\n` +
        `• <code>/setprompt نص</code> — تخصيص تعليمات AI\n` +
        `• <code>/export</code> — تصدير المحادثة كملف TXT\n` +
        `• <code>/search كلمة</code> — بحث في سجل المحادثة\n` +
        `• <code>/clear</code> — مسح سجل المحادثة\n\n` +
        `<b>📂 المجلدات:</b>\n` +
        `• <code>/folders</code> — عرض وإدارة المجلدات\n` +
        `• <code>/newfolder اسم</code> — إنشاء مجلد جديد\n\n` +
        `<b>الأنواع المدعومة:</b>\n` +
        `📊 Excel, CSV  📄 PDF, Word  📝 TXT, JSON, HTML\n` +
        `🖼 صور (JPG, PNG, WEBP)  🎙 رسائل صوتية\n\n` +
        `<b>أمثلة:</b>\n` +
        `• "ما ملخص هذا الملف؟"\n` +
        `• "أنشئ تقرير Excel بالنتائج"\n` +
        `• "ما المتوسط الحسابي للمبيعات؟"`
      )
      return
    }

    // ── /projects ─────────────────────────────────────────────────────────────
    if (text === '/projects') {
      const projects = await db.query(
        'SELECT id, name, pinned FROM projects WHERE user_id=$1 ORDER BY pinned DESC, created_at DESC LIMIT 20', [userId]
      )
      if (!projects.rows.length) {
        await sendMessage(token, chatId, '📂 لا توجد مشاريع.\n\n<code>/newproject اسم_المشروع</code>')
        return
      }
      let msg = '📂 <b>مشاريعك:</b>\n\n'
      projects.rows.forEach(p => {
        msg += `${p.pinned ? '📌 ' : ''}${p.id === settings.active_project_id ? '✅ ' : ''}• <code>/project ${p.name}</code>\n`
      })
      msg += '\n<i>اكتب /project ثم اسم المشروع للتبديل</i>'
      await sendMessage(token, chatId, msg)
      return
    }

    // ── /project <name> ───────────────────────────────────────────────────────
    if (text.startsWith('/project ') || text === '/project') {
      const pName = text.replace(/^\/project\s*/, '').trim()
      if (!pName) { await sendMessage(token, chatId, 'اكتب: <code>/project اسم_المشروع</code>'); return }
      const proj = await db.query('SELECT id, name FROM projects WHERE user_id=$1 AND name ILIKE $2 LIMIT 1', [userId, `%${pName}%`])
      if (!proj.rows.length) {
        await sendMessage(token, chatId, `❌ لم يتم العثور على مشروع يحتوي "<b>${pName}</b>"\n\nاستخدم /projects`)
        return
      }
      await db.query('UPDATE telegram_settings SET active_project_id=$1, updated_at=NOW() WHERE user_id=$2', [proj.rows[0].id, userId])
      settings.active_project_id = proj.rows[0].id
      await db.query('DELETE FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2', [userId, chatId])
      await sendMessage(token, chatId, `✅ تم التبديل إلى مشروع <b>${proj.rows[0].name}</b> 🚀`)
      return
    }

    // ── /newproject <name> ────────────────────────────────────────────────────
    if (text.startsWith('/newproject ') || text === '/newproject') {
      const pName = text.replace(/^\/newproject\s*/, '').trim()
      if (!pName) { await sendMessage(token, chatId, 'اكتب: <code>/newproject اسم_المشروع</code>'); return }
      const count = await db.query('SELECT COUNT(*) FROM projects WHERE user_id=$1', [userId])
      if (parseInt(count.rows[0].count) >= 50) { await sendMessage(token, chatId, '⚠️ وصلت إلى الحد الأقصى (50 مشروعاً).'); return }
      const proj = await db.query('INSERT INTO projects (user_id, name) VALUES ($1,$2) RETURNING id, name', [userId, pName])
      const newProj = proj.rows[0]
      await db.query('INSERT INTO conversations (project_id) VALUES ($1)', [newProj.id])
      await db.query('UPDATE telegram_settings SET active_project_id=$1, updated_at=NOW() WHERE user_id=$2', [newProj.id, userId])
      settings.active_project_id = newProj.id
      await db.query('DELETE FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2', [userId, chatId])
      await sendMessage(token, chatId, `✅ تم إنشاء مشروع <b>${newProj.name}</b>!\n\nأرسل ملفات أو ابدأ المحادثة 📊`)
      return
    }

    // ── /files ────────────────────────────────────────────────────────────────
    if (text === '/files') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع. استخدم /projects'); return }
      const [files, genFiles] = await Promise.all([
        db.query('SELECT original_name, display_name, file_type, file_size FROM files WHERE project_id=$1 ORDER BY sort_order, created_at', [pid]),
        db.query('SELECT original_name, display_name, file_type FROM generated_files WHERE project_id=$1 ORDER BY created_at DESC LIMIT 5', [pid])
      ])
      if (!files.rows.length && !genFiles.rows.length) {
        await sendMessage(token, chatId, '📭 لا توجد ملفات.\n\nأرسل ملفاً للإضافة.')
        return
      }
      let msg = '📁 <b>ملفات المشروع:</b>\n\n'
      files.rows.forEach((f, i) => {
        msg += `${i + 1}. ${fileEmoji(f.file_type)} ${f.display_name || f.original_name} <i>(${formatSize(f.file_size)})</i>\n`
      })
      if (genFiles.rows.length) {
        msg += '\n<b>✨ مُوَّلدة بـ AI:</b>\n'
        genFiles.rows.forEach((f, i) => { msg += `${i + 1}. ✨ ${f.display_name || f.original_name}\n` })
      }
      msg += '\n<i>💡 /download · /preview · /deletefile · /generated</i>'
      await sendMessage(token, chatId, msg)
      return
    }

    // ── /download ─────────────────────────────────────────────────────────────
    if (text === '/download') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const files = await db.query('SELECT id, original_name, display_name, file_type, file_size FROM files WHERE project_id=$1 ORDER BY sort_order, created_at LIMIT 10', [pid])
      if (!files.rows.length) { await sendMessage(token, chatId, '📭 لا توجد ملفات مرفوعة.'); return }
      await sendMessage(token, chatId, '📥 <b>اختر الملف للتحميل:</b>', fileListKeyboard(files.rows, 'df'))
      return
    }

    // ── /deletefile ───────────────────────────────────────────────────────────
    if (text === '/deletefile') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const files = await db.query('SELECT id, original_name, display_name, file_type, file_size FROM files WHERE project_id=$1 ORDER BY sort_order, created_at LIMIT 10', [pid])
      if (!files.rows.length) { await sendMessage(token, chatId, '📭 لا توجد ملفات.'); return }
      await sendMessage(token, chatId, '🗑️ <b>اختر الملف للحذف:</b>', fileListKeyboard(files.rows, 'del'))
      return
    }

    // ── /generated ────────────────────────────────────────────────────────────
    if (text === '/generated') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const genFiles = await db.query('SELECT id, original_name, display_name, file_type, file_size FROM generated_files WHERE project_id=$1 ORDER BY created_at DESC LIMIT 10', [pid])
      if (!genFiles.rows.length) { await sendMessage(token, chatId, '📭 لا توجد ملفات مُوَّلدة.\n\nاطلب من AI إنشاء تقرير.'); return }
      const rows = genFiles.rows.map(f => [{ text: `✨ ${(f.display_name || f.original_name).substring(0, 38)}`, callback_data: `dg:${f.id}` }])
      await sendMessage(token, chatId, '✨ <b>الملفات المُوَّلدة — اختر للتحميل:</b>', { inline_keyboard: rows })
      return
    }

    // ── /preview ──────────────────────────────────────────────────────────────
    if (text === '/preview') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const files = await db.query('SELECT id, original_name, display_name, file_type, file_size FROM files WHERE project_id=$1 ORDER BY sort_order, created_at LIMIT 10', [pid])
      if (!files.rows.length) { await sendMessage(token, chatId, '📭 لا توجد ملفات.'); return }
      await sendMessage(token, chatId, '👁 <b>اختر الملف للمعاينة:</b>', fileListKeyboard(files.rows, 'pv'))
      return
    }

    // ── /stats ────────────────────────────────────────────────────────────────
    if (text === '/stats') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const [proj, files, genFiles, msgs, folders] = await Promise.all([
        db.query('SELECT name, created_at, updated_at FROM projects WHERE id=$1', [pid]),
        db.query('SELECT file_type, file_size FROM files WHERE project_id=$1', [pid]),
        db.query('SELECT COUNT(*) as cnt FROM generated_files WHERE project_id=$1', [pid]),
        db.query('SELECT COUNT(*) as cnt FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.project_id=$1', [pid]),
        db.query('SELECT COUNT(*) as cnt FROM folders WHERE project_id=$1', [pid])
      ])
      const p = proj.rows[0]
      const fileList = files.rows
      const totalSize = fileList.reduce((s, f) => s + (f.file_size || 0), 0)
      const typeCount = {}
      fileList.forEach(f => { typeCount[f.file_type] = (typeCount[f.file_type] || 0) + 1 })
      const typeStr = Object.entries(typeCount).map(([t, n]) => `${fileEmoji(t)} ${t}(${n})`).join(' ') || 'لا توجد'
      await sendMessage(token, chatId,
        `📊 <b>إحصاءات المشروع</b>\n📌 <b>${p?.name || '—'}</b>\n\n` +
        `📁 <b>الملفات المرفوعة:</b> ${fileList.length} (${formatSize(totalSize)})\n` +
        `🗂 <b>الأنواع:</b> ${typeStr}\n` +
        `📂 <b>المجلدات:</b> ${folders.rows[0]?.cnt || 0}\n` +
        `✨ <b>الملفات المُوَّلدة:</b> ${genFiles.rows[0]?.cnt || 0}\n` +
        `💬 <b>رسائل AI:</b> ${msgs.rows[0]?.cnt || 0}\n` +
        `🕐 <b>آخر تحديث:</b> ${p?.updated_at ? new Date(p.updated_at).toLocaleString('ar-EG') : '—'}`
      )
      return
    }

    // ── /model ────────────────────────────────────────────────────────────────
    if (text === '/model' || text.startsWith('/model ')) {
      const arg = text.replace('/model', '').trim().toLowerCase()
      const modelMap = { flash: 'gemini-2.5-flash', pro: 'gemini-2.5-pro', lite: 'gemini-2.5-flash-lite' }
      if (arg && modelMap[arg]) {
        const mdl = modelMap[arg]
        await db.query('UPDATE telegram_settings SET ai_model=$1 WHERE user_id=$2', [mdl, userId])
        await db.query(`INSERT INTO user_ai_settings (user_id, model) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET model=$2, updated_at=NOW()`, [userId, mdl])
        await sendMessage(token, chatId, `✅ تم التبديل إلى نموذج <b>${mdl}</b>`)
        return
      }
      const current = settings.ai_model || 'gemini-2.5-flash'
      await sendMessage(token, chatId,
        `🧠 <b>النموذج الحالي:</b> <code>${current}</code>\n\n` +
        `⚡ <b>Flash</b> — سريع، مثالي لمعظم المهام\n` +
        `🧠 <b>Pro</b> — أقوى تفكيراً، للتحليل المعقد\n` +
        `🪶 <b>Lite</b> — خفيف وسريع للأسئلة البسيطة\n\n` +
        `اختر:`,
        { inline_keyboard: [[
          { text: `${current === 'gemini-2.5-flash' ? '✅ ' : ''}⚡ Flash`, callback_data: 'md:flash' },
          { text: `${current === 'gemini-2.5-pro' ? '✅ ' : ''}🧠 Pro`, callback_data: 'md:pro' },
          { text: `${current === 'gemini-2.5-flash-lite' ? '✅ ' : ''}🪶 Lite`, callback_data: 'md:lite' }
        ]]}
      )
      return
    }

    // ── /export ───────────────────────────────────────────────────────────────
    if (text === '/export') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      await sendTyping(token, chatId)
      const conv = await db.query('SELECT id FROM conversations WHERE project_id=$1 LIMIT 1', [pid])
      if (!conv.rows.length) { await sendMessage(token, chatId, '📭 لا توجد محادثة لتصديرها.'); return }
      const msgs = await db.query('SELECT role, content, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at', [conv.rows[0].id])
      if (!msgs.rows.length) { await sendMessage(token, chatId, '📭 لا توجد رسائل لتصديرها.'); return }
      const projName = (await db.query('SELECT name FROM projects WHERE id=$1', [pid])).rows[0]?.name || 'المشروع'
      let content = `سجل محادثة — ${projName}\n${'='.repeat(50)}\n\n`
      msgs.rows.forEach(m => {
        content += `[${new Date(m.created_at).toLocaleString('ar-EG')}]\n`
        content += `${m.role === 'user' ? '👤 المستخدم' : '🤖 DataChat'}:\n${m.content}\n\n${'-'.repeat(40)}\n\n`
      })
      const exportPath = path.join(__dirname, '../../../uploads/generated', `chat_export_${Date.now()}.txt`)
      fs.writeFileSync(exportPath, content, 'utf8')
      await sendDocument(token, chatId, exportPath, `📤 سجل محادثة: ${projName}`)
      fs.unlink(exportPath, () => {})
      return
    }

    // ── /search <keyword> ─────────────────────────────────────────────────────
    if (text.startsWith('/search ') || text === '/search') {
      const keyword = text.replace('/search', '').trim()
      if (!keyword) { await sendMessage(token, chatId, 'اكتب: <code>/search الكلمة</code>'); return }
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const results = await db.query(
        `SELECT m.role, m.content, m.created_at FROM messages m
         JOIN conversations c ON c.id=m.conversation_id
         WHERE c.project_id=$1 AND m.content ILIKE $2 ORDER BY m.created_at DESC LIMIT 5`,
        [pid, `%${keyword}%`]
      )
      if (!results.rows.length) { await sendMessage(token, chatId, `🔍 لا توجد نتائج لـ "<b>${keyword}</b>"`); return }
      let msg = `🔍 <b>نتائج البحث عن: "${keyword}"</b>\n\n`
      results.rows.forEach((m, i) => {
        const idx = m.content.toLowerCase().indexOf(keyword.toLowerCase())
        const snippet = m.content.substring(Math.max(0, idx - 40), idx + 120).replace(/\n/g, ' ')
        msg += `${i + 1}. ${m.role === 'user' ? '👤' : '🤖'} <i>${new Date(m.created_at).toLocaleDateString('ar-EG')}</i>\n<i>...${snippet}...</i>\n\n`
      })
      await sendMessage(token, chatId, msg)
      return
    }

    // ── /folders ──────────────────────────────────────────────────────────────
    if (text === '/folders') {
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const folders = await db.query('SELECT id, name FROM folders WHERE project_id=$1 ORDER BY sort_order, created_at', [pid])
      if (!folders.rows.length) {
        await sendMessage(token, chatId, '📂 لا توجد مجلدات.\n\nأنشئ مجلداً: <code>/newfolder اسم_المجلد</code>')
        return
      }
      const rows = folders.rows.map(f => [
        { text: `📁 ${f.name}`, callback_data: 'cancel' },
        { text: '🗑️ حذف', callback_data: `fdc:${f.id}` }
      ])
      await sendMessage(token, chatId, `📂 <b>مجلدات المشروع (${folders.rows.length}):</b>`, { inline_keyboard: rows })
      return
    }

    // ── /newfolder <name> ─────────────────────────────────────────────────────
    if (text.startsWith('/newfolder ') || text === '/newfolder') {
      const fName = text.replace('/newfolder', '').trim()
      if (!fName) { await sendMessage(token, chatId, 'اكتب: <code>/newfolder اسم_المجلد</code>'); return }
      const pid = settings.active_project_id
      if (!pid) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع.'); return }
      const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM folders WHERE project_id=$1', [pid])
      await db.query('INSERT INTO folders (project_id, name, sort_order) VALUES ($1,$2,$3)', [pid, fName, parseInt(maxOrder.rows[0].m) + 1])
      await sendMessage(token, chatId, `✅ تم إنشاء مجلد <b>${fName}</b> بنجاح!`)
      return
    }

    // ── /setprompt <prompt> ───────────────────────────────────────────────────
    if (text.startsWith('/setprompt ') || text === '/setprompt') {
      const prompt = text.replace('/setprompt', '').trim()
      if (!prompt) {
        const current = settings.custom_prompt
        await sendMessage(token, chatId,
          `⚙️ <b>التعليمات الحالية:</b>\n<i>${current ? current.substring(0, 300) : 'افتراضية'}</i>\n\n` +
          `لتغييرها:\n<code>/setprompt تعليماتك هنا</code>\n\n` +
          `<i>مثال: /setprompt أنت خبير في تحليل بيانات المبيعات وتقديم توصيات تجارية.</i>`
        )
        return
      }
      await db.query('UPDATE telegram_settings SET custom_prompt=$1 WHERE user_id=$2', [prompt, userId])
      await db.query(`INSERT INTO user_ai_settings (user_id, system_prompt) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET system_prompt=$2, updated_at=NOW()`, [userId, prompt])
      await sendMessage(token, chatId, `✅ تم حفظ التعليمات المخصصة:\n\n<i>${prompt.substring(0, 250)}</i>`)
      return
    }

    // ── /clear ────────────────────────────────────────────────────────────────
    if (text === '/clear') {
      await db.query('DELETE FROM telegram_chats WHERE user_id=$1 AND telegram_chat_id=$2', [userId, chatId])
      await sendMessage(token, chatId, '🗑️ تم مسح سجل المحادثة.\n\nابدأ محادثة جديدة.')
      return
    }

    // ── Unknown command ───────────────────────────────────────────────────────
    if (text.startsWith('/')) {
      await sendMessage(token, chatId, '❓ أمر غير معروف. اكتب /help لعرض الأوامر.')
      return
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VOICE MESSAGE — transcribe then process with AI
    // ══════════════════════════════════════════════════════════════════════════
    if (message.voice || message.audio) {
      const voiceObj = message.voice || message.audio
      await sendTyping(token, chatId)
      const processingMsg = await sendMessage(token, chatId, '🎙 جاري تحويل الرسالة الصوتية إلى نص...')
      try {
        const fileInfoRes = await tg(token, 'getFile', { file_id: voiceObj.file_id })
        if (!fileInfoRes.data?.ok) { await sendMessage(token, chatId, '❌ تعذّر الحصول على الملف الصوتي.'); return }
        const tgFilePath = fileInfoRes.data.result.file_path
        const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`
        const audioRes = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
        const audioBase64 = Buffer.from(audioRes.data).toString('base64')
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) { await sendMessage(token, chatId, '❌ مفتاح Gemini غير مُعد.'); return }
        const genAI = new GoogleGenerativeAI(apiKey)
        const geminiModel = genAI.getGenerativeModel({ model: settings.ai_model || 'gemini-2.5-flash' })
        const transcriptResult = await geminiModel.generateContent([
          { inlineData: { mimeType: 'audio/ogg', data: audioBase64 } },
          'قم بنسخ هذا المقطع الصوتي بالكامل بدقة. أعد الكلام المنطوق فقط دون أي تعليق.'
        ])
        const transcript = transcriptResult.response.text().trim()
        if (!transcript) { await sendMessage(token, chatId, '❌ لم يتمكن النظام من فهم الرسالة الصوتية.'); return }
        await sendMessage(token, chatId, `🎙 <b>النص المُستخرج:</b>\n<i>${transcript.substring(0, 300)}</i>\n\n⏳ جاري المعالجة...`)
        if (!settings.active_project_id) { await sendMessage(token, chatId, '⚠️ لم يتم تحديد مشروع. استخدم /projects'); return }
        await sendTyping(token, chatId)
        const conversationId = await getOrCreateConversation(userId, chatId, settings)
        const { fullResponse, generatedFile } = await callAI(userId, user.role, settings.active_project_id, conversationId, transcript)
        await sendAIResult(token, chatId, fullResponse, generatedFile, true)
      } catch (e) {
        console.error('[TG] Voice error:', e.message)
        await sendMessage(token, chatId, '❌ حدث خطأ أثناء معالجة الرسالة الصوتية.')
      }
      return
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHOTO — save to project and offer quick actions
    // ══════════════════════════════════════════════════════════════════════════
    if (message.photo) {
      if (!settings.active_project_id) { await sendMessage(token, chatId, '⚠️ يرجى تحديد مشروع أولاً: /projects'); return }
      const cnt = await db.query('SELECT COUNT(*) FROM files WHERE project_id=$1', [settings.active_project_id])
      if (parseInt(cnt.rows[0].count) >= 10) { await sendMessage(token, chatId, '❌ وصل المشروع للحد الأقصى (10 ملفات).'); return }
      await sendTyping(token, chatId)
      try {
        const photo = message.photo[message.photo.length - 1]
        const fileInfoRes = await tg(token, 'getFile', { file_id: photo.file_id })
        if (!fileInfoRes.data?.ok) { await sendMessage(token, chatId, '❌ تعذّر الحصول على الصورة.'); return }
        const tgFilePath = fileInfoRes.data.result.file_path
        const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`
        const imageRes = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
        const imageBuffer = Buffer.from(imageRes.data)
        const projectDir = path.join(__dirname, '../../../uploads', 'users', `user_${padId(user.id)}`, 'projects', `project_${padId(settings.active_project_id)}`)
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })
        const storedName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.jpg`
        fs.writeFileSync(path.join(projectDir, storedName), imageBuffer)
        const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM files WHERE project_id=$1', [settings.active_project_id])
        const fileName = message.caption ? `${message.caption.substring(0, 50)}.jpg` : `photo_${Date.now()}.jpg`
        await db.query(
          'INSERT INTO files (project_id, original_name, stored_name, file_type, file_size, mime_type, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [settings.active_project_id, fileName, storedName, 'image', imageBuffer.length, 'image/jpeg', parseInt(maxOrder.rows[0].m) + 1]
        )
        await db.query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [settings.active_project_id])
        await sendMessage(token, chatId,
          `✅ تم رفع الصورة بنجاح! (${formatSize(imageBuffer.length)})\n\n💬 ماذا تريد أن أفعل بها؟`,
          { inline_keyboard: [[
            { text: '📖 اقرأ النص (OCR)', callback_data: 'qa:sum' },
            { text: '🔍 حلّل الصورة', callback_data: 'qa:deep' },
            { text: '📊 استخرج البيانات', callback_data: 'qa:num' }
          ]]}
        )
      } catch (e) {
        console.error('[TG] Photo error:', e.message)
        await sendMessage(token, chatId, '❌ حدث خطأ أثناء رفع الصورة.')
      }
      return
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DOCUMENT — file upload
    // ══════════════════════════════════════════════════════════════════════════
    if (message.document) {
      if (!settings.active_project_id) { await sendMessage(token, chatId, '⚠️ يرجى تحديد مشروع أولاً: /projects'); return }
      await sendTyping(token, chatId)
      const doc = message.document
      const fileName = doc.file_name || `file_${Date.now()}`
      const fileExt = path.extname(fileName).toLowerCase().replace('.', '')
      const supported = ['csv', 'xlsx', 'xls', 'xlsm', 'pdf', 'docx', 'doc', 'txt', 'json', 'html', 'htm', 'md']
      if (!supported.includes(fileExt)) {
        await sendMessage(token, chatId, `❌ نوع الملف <b>.${fileExt}</b> غير مدعوم.\n\nالأنواع المدعومة: ${supported.join(', ')}`)
        return
      }
      const cnt2 = await db.query('SELECT COUNT(*) FROM files WHERE project_id=$1', [settings.active_project_id])
      if (parseInt(cnt2.rows[0].count) >= 10) { await sendMessage(token, chatId, '❌ وصل المشروع للحد الأقصى (10 ملفات).'); return }
      const fileInfoRes = await tg(token, 'getFile', { file_id: doc.file_id })
      if (!fileInfoRes.data?.ok) { await sendMessage(token, chatId, '❌ فشل الحصول على معلومات الملف.'); return }
      const tgFilePath = fileInfoRes.data.result.file_path
      const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`
      const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 })
      const fileBuffer = Buffer.from(fileRes.data)
      const projectDir2 = path.join(__dirname, '../../../uploads', 'users', `user_${padId(user.id)}`, 'projects', `project_${padId(settings.active_project_id)}`)
      if (!fs.existsSync(projectDir2)) fs.mkdirSync(projectDir2, { recursive: true })
      const storedName2 = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${fileExt}`
      fs.writeFileSync(path.join(projectDir2, storedName2), fileBuffer)
      const mappedFileType = getFileType(fileName)
      const maxOrder3 = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM files WHERE project_id=$1', [settings.active_project_id])
      await db.query(
        'INSERT INTO files (project_id, original_name, stored_name, file_type, file_size, mime_type, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [settings.active_project_id, fileName, storedName2, mappedFileType, fileBuffer.length, doc.mime_type || 'application/octet-stream', parseInt(maxOrder3.rows[0].m) + 1]
      )
      await db.query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [settings.active_project_id])
      await sendMessage(token, chatId,
        `✅ تم رفع الملف <b>${fileName}</b>\n📦 ${formatSize(fileBuffer.length)}\n\n💬 ماذا تريد أن أفعل؟`,
        quickActionsKeyboard()
      )
      return
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TEXT MESSAGE — AI Chat
    // ══════════════════════════════════════════════════════════════════════════
    if (!text) return

    if (!settings.active_project_id) {
      await sendMessage(token, chatId,
        '⚠️ لم يتم تحديد مشروع.\n\nاستخدم /projects أو /newproject اسم لإنشاء مشروع.'
      )
      return
    }

    await sendTyping(token, chatId)
    const conversationId = await getOrCreateConversation(userId, chatId, settings)
    try {
      const { fullResponse, generatedFile } = await callAI(userId, user.role, settings.active_project_id, conversationId, text)
      await sendAIResult(token, chatId, fullResponse, generatedFile, true)
    } catch (aiErr) {
      console.error('[TG] AI call error:', aiErr.message)
      await sendMessage(token, chatId, '❌ حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.')
    }

  } catch (err) {
    console.error('[TG] Webhook error:', err.message)
  }
})

module.exports = router
