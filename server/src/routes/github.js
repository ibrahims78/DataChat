const express = require('express')
const router = express.Router()
const db = require('../lib/db')
const { authenticate } = require('../middleware/auth')
const axios = require('axios')

function ghClient(token) {
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DataChat-AI/1.0'
    },
    timeout: 30000,
    validateStatus: null
  })
}

// ── GET /api/github/settings ────────────────────────────────────────────────
router.get('/settings', authenticate, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM github_settings WHERE user_id=$1', [req.user.id])
    if (!r.rows.length) return res.json({ connected: false })
    const s = r.rows[0]
    res.json({
      connected: true,
      github_username: s.github_username,
      github_name: s.github_name,
      avatar_url: s.avatar_url,
      public_repos: s.public_repos,
      connected_at: s.connected_at
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── POST /api/github/connect ─────────────────────────────────────────────────
router.post('/connect', authenticate, async (req, res) => {
  try {
    const { access_token } = req.body
    if (!access_token?.trim()) return res.status(400).json({ error: 'access_token مطلوب' })

    // Verify token by fetching user profile
    const gh = ghClient(access_token.trim())
    const userRes = await gh.get('/user')
    if (userRes.status !== 200) {
      return res.status(400).json({ error: 'التوكن غير صحيح أو منتهي الصلاحية. تأكد من صلاحيات: repo, read:user' })
    }
    const profile = userRes.data

    await db.query(`
      INSERT INTO github_settings (user_id, access_token, github_username, github_name, avatar_url, public_repos)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO UPDATE SET
        access_token=$2, github_username=$3, github_name=$4,
        avatar_url=$5, public_repos=$6, updated_at=NOW()
    `, [req.user.id, access_token.trim(), profile.login, profile.name, profile.avatar_url, profile.public_repos])

    res.json({
      success: true,
      github_username: profile.login,
      github_name: profile.name,
      avatar_url: profile.avatar_url,
      public_repos: profile.public_repos,
      message: `تم الربط بنجاح مع حساب @${profile.login} 🎉`
    })
  } catch (err) {
    console.error('[GitHub] Connect error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/github/disconnect ────────────────────────────────────────────
router.delete('/disconnect', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM github_settings WHERE user_id=$1', [req.user.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── GET /api/github/repos ─────────────────────────────────────────────────
router.get('/repos', authenticate, async (req, res) => {
  try {
    const s = await db.query('SELECT access_token FROM github_settings WHERE user_id=$1', [req.user.id])
    if (!s.rows.length) return res.status(401).json({ error: 'غير مرتبط بـ GitHub' })
    const gh = ghClient(s.rows[0].access_token)
    const r = await gh.get('/user/repos', { params: { sort: 'updated', per_page: 30, type: 'owner' } })
    if (r.status !== 200) return res.status(r.status).json({ error: r.data?.message })
    res.json(r.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      language: repo.language,
      stars: repo.stargazers_count,
      updated_at: repo.updated_at,
      default_branch: repo.default_branch,
      url: repo.html_url
    })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
