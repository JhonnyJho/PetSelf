import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pkg from 'pg'

const { Pool } = pkg
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const PORT = parseInt(process.env.PORT || '4000', 10)
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret'
const JWT_EXPIRATION = '8h'

const validateEmail = (email) => typeof email === 'string' && email.includes('@')
const validatePassword = (password) => typeof password === 'string' && password.length >= 8

const generateToken = (user) => jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRATION })

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PostgreSQL auth backend is running' })
})

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Provide a valid email and a password with at least 8 characters.' })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase().trim(), passwordHash]
    )

    const user = result.rows[0]
    res.status(201).json({ user: { id: user.id, email: user.email, createdAt: user.created_at } })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered.' })
    }
    console.error('Register error:', error)
    res.status(500).json({ error: 'Unable to create user.' })
  }
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ error: 'Provide a valid email and password.' })
  }

  try {
    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase().trim()])
    const user = result.rows[0]

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const token = generateToken(user)
    res.json({ token, user: { id: user.id, email: user.email } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Unable to log in.' })
  }
})

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.userId])
    const user = result.rows[0]

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    res.json({ user: { id: user.id, email: user.email, createdAt: user.created_at } })
  } catch (error) {
    console.error('Profile error:', error)
    res.status(500).json({ error: 'Unable to load profile.' })
  }
})

app.listen(PORT, () => {
  console.log(`Auth backend listening on http://localhost:${PORT}`)
})
