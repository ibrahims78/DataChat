const express = require('express')
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const { parse } = require('csv-parse/sync')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

async function extractFileContent(file) {
  const filePath = path.join(__dirname, '../../../uploads', file.stored_name)
  try {
    if (file.file_type === 'excel') {
      const wb = XLSX.readFile(filePath)
      let content = `[ملف Excel: ${file.original_name}]\n`
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        content += `\nورقة العمل: ${name}\n`
        content += data.slice(0, 200).map(row => row.join('\t')).join('\n')
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
        content += `\n[إجمالي: ${range.e.r} صف × ${range.e.c + 1} عمود]`
      })
      return content
    }
    if (file.file_type === 'csv') {
      const raw = fs.readFileSync(filePath, 'utf8')
      const records = parse(raw, { skip_empty_lines: true })
      return `[ملف CSV: ${file.original_name}]\n${records.slice(0, 200).map(r => r.join('\t')).join('\n')}\n[إجمالي: ${records.length} صف]`
    }
    if (file.file_type === 'pdf') {
      const buf = fs.readFileSync(filePath)
      const data = await pdfParse(buf)
      return `[ملف PDF: ${file.original_name}]\n${data.text.substring(0, 8000)}\n[${data.numpages} صفحة]`
    }
    if (file.file_type === 'word') {
      const result = await mammoth.extractRawText({ path: filePath })
      return `[ملف Word: ${file.original_name}]\n${result.value.substring(0, 8000)}`
    }
  } catch (e) { return `[خطأ في قراءة ${file.original_name}: ${e.message}]` }
}

async function generateExcelFile(data, filename) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('البيانات')
  if (data.headers) {
    const headerRow = ws.addRow(data.headers)
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }
    })
  }
  if (data.rows) data.rows.forEach(row => ws.addRow(row))
  ws.columns.forEach(col => { col.width = 18 })
  const genDir = path.join(__dirname, '../../../uploads/generated')
  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true })
  const storedName = `${Date.now()}-${filename}.xlsx`
  await wb.xlsx.writeFile(path.join(genDir, storedName))
  return { storedName, originalName: `${filename}.xlsx` }
}

async function generatePDFFile(content, filename) {
  const genDir = path.join(__dirname, '../../../uploads/generated')
  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true })
  const storedName = `${Date.now()}-${filename}.pdf`
  const doc = new PDFDocument({ margin: 50 })
  doc.pipe(fs.createWriteStream(path.join(genDir, storedName)))
  doc.font('Helvetica-Bold').fontSize(18).text('DataChat — تقرير', { align: 'center' })
  doc.moveDown()
  doc.font('Helvetica').fontSize(12).text(content, { paragraphGap: 5 })
  doc.end()
  await new Promise(r => doc.on('finish', r))
  return { storedName, originalName: `${filename}.pdf` }
}

router.post('/:projectId/message', async (req, res) => {
  try {
    const { message, conversationId } = req.body
    const projectCheck = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId])
    if (!projectCheck.rows.length) return res.status(404).json({ error: 'Project not found' })
    if (req.user.role !== 'admin' && projectCheck.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' })

    const files = await db.query('SELECT * FROM files WHERE project_id=$1', [req.params.projectId])
    const settings = await db.query('SELECT * FROM ai_settings WHERE id=1')
    const aiConfig = settings.rows[0] || {}

    let fileContents = ''
    for (const file of files.rows) {
      fileContents += await extractFileContent(file) + '\n\n'
    }

    const history = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20',
      [conversationId]
    )
    const msgs = history.rows.reverse()

    await db.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)', [conversationId, 'user', message])

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const systemPrompt = (aiConfig.system_prompt || '') +
      (fileContents ? `\n\nالملفات المتاحة:\n${fileContents}` : '')

    const model = genAI.getGenerativeModel({
      model: aiConfig.model || 'gemini-1.5-flash',
      generationConfig: { temperature: parseFloat(aiConfig.temperature) || 0.7 }
    })

    const chatHistory = msgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const chat = model.startChat({ history: chatHistory, systemInstruction: systemPrompt })

    let fullResponse = ''
    try {
      const result = await chat.sendMessageStream(message)
      for await (const chunk of result.stream) {
        const text = chunk.text()
        fullResponse += text
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
      }
    } catch (aiErr) {
      fullResponse = `عذراً، حدث خطأ في الاتصال بالذكاء الاصطناعي: ${aiErr.message}`
      res.write(`data: ${JSON.stringify({ type: 'text', content: fullResponse })}\n\n`)
    }

    const aiMsgResult = await db.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3) RETURNING id',
      [conversationId, 'assistant', fullResponse]
    )

    let generatedFile = null
    const lowerResponse = fullResponse.toLowerCase()
    if (lowerResponse.includes('excel') || lowerResponse.includes('.xlsx')) {
      try {
        const excelData = { headers: ['العمود 1', 'العمود 2', 'العمود 3'], rows: [['بيانات', 'بيانات', 'بيانات']] }
        const ef = await generateExcelFile(excelData, 'تقرير_' + Date.now())
        const gf = await db.query(
          'INSERT INTO generated_files (project_id, message_id, original_name, stored_name, file_type) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [req.params.projectId, aiMsgResult.rows[0].id, ef.originalName, ef.storedName, 'excel']
        )
        generatedFile = gf.rows[0]
      } catch {}
    }

    await db.query('UPDATE projects SET updated_at=NOW() WHERE id=$1', [req.params.projectId])
    res.write(`data: ${JSON.stringify({ type: 'done', messageId: aiMsgResult.rows[0].id, generatedFile })}\n\n`)
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    res.end()
  }
})

router.patch('/messages/:messageId/rating', async (req, res) => {
  try {
    const { rating, comment } = req.body
    await db.query('UPDATE messages SET rating=$1, rating_comment=$2 WHERE id=$3', [rating, comment, req.params.messageId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/messages/:messageId', async (req, res) => {
  try {
    const { content } = req.body
    const msg = await db.query('SELECT * FROM messages WHERE id=$1', [req.params.messageId])
    if (!msg.rows.length) return res.status(404).json({ error: 'Message not found' })
    await db.query('UPDATE messages SET content=$1 WHERE id=$2', [content, req.params.messageId])
    await db.query('DELETE FROM messages WHERE conversation_id=$1 AND created_at > (SELECT created_at FROM messages WHERE id=$2)', [msg.rows[0].conversation_id, req.params.messageId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:projectId/export', async (req, res) => {
  try {
    const { format = 'pdf' } = req.query
    const projectCheck = await db.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId])
    if (!projectCheck.rows.length) return res.status(404).json({ error: 'Not found' })
    const conv = await db.query('SELECT id FROM conversations WHERE project_id=$1 LIMIT 1', [req.params.projectId])
    const messages = await db.query('SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at', [conv.rows[0].id])

    const content = messages.rows.map(m => `${m.role === 'user' ? 'المستخدم' : 'DataChat'}: ${m.content}`).join('\n\n---\n\n')

    if (format === 'txt') {
      res.setHeader('Content-Disposition', `attachment; filename="chat-export.txt"`)
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      return res.send(content)
    }
    const pdf = await generatePDFFile(content, 'chat-export')
    res.download(path.join(__dirname, '../../../uploads/generated', pdf.storedName), pdf.originalName)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.json([])
    const isAdmin = req.user.role === 'admin'
    const query = isAdmin
      ? `SELECT p.id, p.name, m.content, m.created_at FROM projects p
         JOIN conversations c ON c.project_id = p.id
         JOIN messages m ON m.conversation_id = c.id
         WHERE m.content ILIKE $1 ORDER BY m.created_at DESC LIMIT 20`
      : `SELECT p.id, p.name, m.content, m.created_at FROM projects p
         JOIN conversations c ON c.project_id = p.id
         JOIN messages m ON m.conversation_id = c.id
         WHERE p.user_id=$2 AND m.content ILIKE $1 ORDER BY m.created_at DESC LIMIT 20`
    const params = isAdmin ? [`%${q}%`] : [`%${q}%`, req.user.id]
    const result = await db.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
