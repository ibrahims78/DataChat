const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'datachat-secret-key-change-in-production'

function authenticate(req, res, next) {
  // Accept token from Authorization header OR ?token= query param (for file downloads)
  let token = null
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else if (req.query.token) {
    token = req.query.token
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

module.exports = { authenticate, adminOnly, JWT_SECRET }
