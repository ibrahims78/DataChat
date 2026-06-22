const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// ── GET /api/user/ai-settings ────────────────────────────────────────────────
router.get('/ai-settings', authenticate, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM user_ai_settings WHERE user_id=$1', [req.user.id])
    const s = r.rows[0] || {}
    res.json({
      provider: s.provider || 'gemini',
      model: s.model || 'gemini-2.5-flash',
      temperature: parseFloat(s.temperature) || 0.7,
      system_prompt: s.system_prompt || '',
      has_api_key: !!s.api_key,
      api_key: '',
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/user/ai-settings ───────────────────────────────────────────────
router.post('/ai-settings', authenticate, async (req, res) => {
  try {
    const { provider, model, temperature, system_prompt, api_key, clear_key } = req.body
    const existing = await db.query('SELECT api_key FROM user_ai_settings WHERE user_id=$1', [req.user.id])
    const existingKey = existing.rows[0]?.api_key
    const newKey = clear_key ? null : (api_key && api_key.trim() ? api_key.trim() : existingKey || null)

    await db.query(`
      INSERT INTO user_ai_settings (user_id, api_key, provider, model, temperature, system_prompt)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO UPDATE SET
        api_key=$2, provider=$3, model=$4, temperature=$5, system_prompt=$6, updated_at=NOW()
    `, [req.user.id, newKey, provider || 'gemini', model || 'gemini-2.5-flash',
       parseFloat(temperature) || 0.7, system_prompt || ''])

    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/user/ai-settings/test ─────────────────────────────────────────
router.post('/ai-settings/test', authenticate, async (req, res) => {
  try {
    const { api_key, provider } = req.body
    if (!api_key?.trim()) return res.status(400).json({ error: 'أدخل المفتاح أولاً' })

    if (!provider || provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(api_key.trim())
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 8 }
      })
      await model.generateContent('test')
      res.json({ success: true, message: 'مفتاح Gemini صالح ✅' })
    } else {
      const axios = require('axios')
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      }, {
        headers: { Authorization: `Bearer ${api_key.trim()}` },
        timeout: 15000,
        validateStatus: null
      })
      if (resp.status === 200) res.json({ success: true, message: 'مفتاح OpenAI صالح ✅' })
      else res.status(400).json({ error: resp.data?.error?.message || 'مفتاح غير صالح' })
    }
  } catch (err) {
    res.status(400).json({ error: 'مفتاح غير صالح: ' + (err.message || 'خطأ غير معروف') })
  }
})

module.exports = router
