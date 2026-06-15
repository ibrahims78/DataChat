require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const helmet = require('helmet')
const db = require('./lib/db')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')))

const uploadsDir = path.join(__dirname, '../../uploads')
const generatedDir = path.join(uploadsDir, 'generated')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true })

app.use('/api/auth', require('./routes/auth'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/files', require('./routes/files'))
app.use('/api/chat', require('./routes/chat'))
app.use('/api/admin', require('./routes/admin'))

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use((err, req, res, next) => {
  console.error(err.stack)
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Max 50MB.' })
  res.status(500).json({ error: 'Internal server error' })
})

async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'lib/schema.sql'), 'utf8')
    await db.query(schema)
    console.log('✅ Database schema initialized')
  } catch (err) {
    console.error('❌ DB init error:', err.message)
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 DataChat server running on port ${PORT}`)
  await initDB()
})
