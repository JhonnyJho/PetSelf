// server/index.js — vienkāršs PostgreSQL autentifikācijas un spēles backend
// Komentāri latviešu valodā: mērķis — uzlabot koda lasāmību un saprašanu.
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pkg from 'pg'
import { URL } from 'url'
import path from 'path'
import { fileURLToPath } from 'url'
import { sendWelcomeEmail } from './utils/email.js'
import { resolvePgPoolConfig } from './utils/db.js'
import './jobs/taskReminder.js'
const { Pool } = pkg
dotenv.config()
// Ielādē `.env` failu un inicializē vides mainīgos (piem., DATABASE_URL, JWT_SECRET)
const app = express()
app.use(cors())
app.use(express.json())

// Serve built React frontend
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Serve static files from dist folder (built React app)
app.use(express.static(path.join(__dirname, '..', 'dist')))

// Serve 3D models from public
app.use('/models', express.static(path.join(__dirname, '..', 'public', 'models')))
// Pārbauda DATABASE_URL un izvada saprotamu kļūdas ziņojumu, ja konfigurācija nav derīga
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  console.error('DATABASE_URL nav iestatīts. Piemērs: postgres://user:password@localhost:5432/petself')
  process.exit(1)
}
try {
  const parsed = new URL(DB_URL)
  if (!parsed.username) {
    console.warn('Brīdinājums: DATABASE_URL nesatur lietotājvārdu. Ja PostgreSQL pieprasa autentifikāciju, pievienojiet lietotājvārdu un paroli.')
  }
} catch (e) {
  console.error('DATABASE_URL nav derīga:', e.message)
  process.exit(1)
}

// Izveido savienojumu ar PostgreSQL un reģistrē pool kļūdas
const pool = new Pool(resolvePgPoolConfig(DB_URL))
pool.on('error', (err) => {
  console.error('Nezināma PostgreSQL kļūda poolā:', err && err.message ? err.message : err)
  if (err && err.message && err.message.includes('client password must be a string')) {
    console.error('SCRAM autentifikācijas kļūda: pārliecinieties, ka DATABASE_URL satur paroli kā tekstu, piem., postgres://user:password@host:5432/db')
  }
})
// Izveido vai pārbauda `users` tabulu un unikālos indeksus
const ensureUsersTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(50),
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)
    try { await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email))") } catch (e) {}
    try { await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_lower_unique ON users (LOWER(nickname)) WHERE nickname IS NOT NULL") } catch (e) {}
  } catch (err) {
    console.error('Failed to ensure users table:', err)
  }
}
ensureUsersTable()

// Draugu pieprasījumu tabula: nodrošina `friend_requests` struktūru
const ensureFriendTables = async () => { try { await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (from_user_id, to_user_id)
      );
    `) } catch (err) { console.error('Failed to ensure friend tables:', err) } }
ensureFriendTables()

// Bloķēto lietotāju tabula
const ensureBlockedUsersTable = async () => { try { await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id SERIAL PRIMARY KEY,
        blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (blocker_id, blocked_id)
      );
    `) } catch (err) { console.error('Failed to ensure blocked users table:', err) } }
ensureBlockedUsersTable()

// Mājdzīvnieku tabula: glabā pet datus (nosaukums, izskats, xp, līmenis)
const ensurePetsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        appearance VARCHAR(50) NOT NULL,
        color VARCHAR(50) NOT NULL,
        gender VARCHAR(50),
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)
  } catch (err) {
    console.error('Failed to ensure pets table:', err)
  }
}
ensurePetsTable()
// Pievieno nepieciešamās kolonnas pet tabulai, ja tās trūkst
const ensurePetColumns = async () => { try { await pool.query("ALTER TABLE pets ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0"); await pool.query("ALTER TABLE pets ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1") } catch (err) { console.error('Failed to ensure pet columns:', err) } }
ensurePetColumns()
// Aprēķina, cik XP nepieciešams nākamajam līmenim
function xpForNextLevel(level = 1) { const lvl = Math.max(1, Number(level) || 1); return 100 + (lvl - 1) * 5 }
// Aprēķina pašreizējo līmeni, cik XP ir "iekšā" šajā līmenī un cik vajadzīgs nākamajam
function getLevelProgress(totalXp = 0) { let remaining = Math.max(0, Math.floor(Number(totalXp) || 0)); let level = 1; while (remaining >= xpForNextLevel(level)) { remaining -= xpForNextLevel(level); level += 1 } return { level, xpIntoLevel: remaining, xpForNextLevel: xpForNextLevel(level) } }
// Tabulas priekš lietošanas priekšmetiem un aktīvajiem efektiem (items, active_effects)
const ensureItemsAndEffects = async () => { try { await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL,
        subtype VARCHAR(50),
        payload JSONB,
        rarity VARCHAR(20) DEFAULT 'common',
        consumed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `); await pool.query(`
      CREATE TABLE IF NOT EXISTS active_effects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        effect_type VARCHAR(50) NOT NULL,
        multiplier NUMERIC DEFAULT 1,
        uses_remaining INTEGER,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `); try { await pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) DEFAULT 'common'") } catch (err) { console.error('Failed ensuring rarity column for items:', err) } } catch (err) { console.error('Failed to ensure items/effects tables:', err) } }
ensureItemsAndEffects()
// Servera porti un JWT (autentifikācijas) iestatījumi
const PORT = parseInt(process.env.PORT || '3000', 10)
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret'
const JWT_EXPIRATION = '8h'
// Vienkārša ievades validācija
const validateEmail = (email) => typeof email === 'string' && email.includes('@')
// Basic check used for login/input presence
const validatePassword = (password) => typeof password === 'string' && password.length > 0
// Strong password policy for creation: min 8 chars, at least one digit and one special symbol
const validatePasswordComplex = (password) =>
  typeof password === 'string' && /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?`~]).{8,}$/.test(password)
// JWT ģenerēšana un autorizācijas starpprogrammatūra
const generateToken = (user) => jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRATION })
// Middleware, kas pārbauda `Authorization: Bearer <token>` un pievieno `req.user`
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Trūkst autorizācijas tokena' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Nederīgs vai beidzies tokens' })
  }
}
// API maršruti: reģistrācija, pieteikšanās, profila pārvaldība, draugi, uzdevumi, inventārs
app.get('/', (req, res) => res.json({ status: 'ok', message: 'PostgreSQL autentifikācijas backend darbojas' }))

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.post('/api/setup-moderator', async (req, res) => {
  const { secret, email, password } = req.body
  if (secret !== 'setup_moderator_2026')
    return res.status(403).json({ error: 'Nederīgs noslēpums.' })
  if (!validateEmail(email) || !validatePasswordComplex(password))
    return res.status(400).json({ error: 'Norādiet derīgu e-pastu un paroli (vismaz 8 rakstzīmes; jāiekļauj vismaz 1 cipars un 1 speciāls simbols).' })
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'")
    const existing = await pool.query('SELECT id FROM users WHERE role = $1', ['moderator'])
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Moderators jau eksistē.' })
    const passwordHash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, nickname) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at',
      [email.toLowerCase().trim(), passwordHash, 'moderator', 'moderator']
    )
    const user = result.rows[0]
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, createdAt: user.created_at } })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'E-pasts jau reģistrēts.' })
    console.error('Setup moderator error:', error)
    res.status(500).json({ error: 'Neizdevās izveidot moderatoru.' })
  }
})
app.post('/api/register', async (req, res) => {
  const { email, password, nickname } = req.body
  if (!validateEmail(email) || !validatePasswordComplex(password))
    return res.status(400).json({ error: 'Norādiet derīgu e-pastu un paroli (vismaz 8 rakstzīmes; jāiekļauj vismaz 1 cipars un 1 speciāls simbols).' })
  const passwordHash = await bcrypt.hash(password, 10)
  if (req.body.role === 'moderator')
    return res.status(403).json({ error: 'Jūs nevarat izveidot moderatora kontu.' })
  const role = 'user'
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'")
    let nickToStore = null
    if (nickname && typeof nickname === 'string') {
      const trimmedNick = nickname.trim().toLowerCase()
      if (trimmedNick.length < 4 || trimmedNick.length > 7)
        return res.status(400).json({ error: 'Segvārdam jābūt 4–7 rakstzīmēm.' })
      const nickCheck = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = $1', [trimmedNick])
      if (nickCheck.rows.length > 0) return res.status(409).json({ error: 'Segvārds jau aizņemts.' })
      nickToStore = trimmedNick
    }
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, nickname) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at',
      [email.toLowerCase().trim(), passwordHash, role, nickToStore]
    )
    const user = result.rows[0]
    try {
      const candies = [
        { name: 'Parasta XP konfekte', amount: 5, rarity: 'common', color: 'green', description: 'Mazs zaļš bumbiņš. Piešķir 5 XP.' },
        { name: 'Neparasta XP konfekte', amount: 10, rarity: 'uncommon', color: 'blue', description: 'Mazs zils bumbiņš. Piešķir 10 XP.' },
        { name: 'Retā XP konfekte', amount: 15, rarity: 'rare', color: 'red', description: 'Mazs sarkans bumbiņš. Piešķir 15 XP.' },
      ]
      for (const c of candies) {
        await pool.query(
          'INSERT INTO items (user_id, name, type, subtype, payload, rarity) VALUES ($1,$2,$3,$4,$5,$6)',
          [user.id, c.name, 'consumable', 'xp', JSON.stringify({ amount: c.amount, description: c.description, appearance: 'sphere', color: c.color }), c.rarity]
        )
      }
    } catch (e) {
      console.error('Failed to insert starter candies for user', user.id, e)
    }
    try {
      await sendWelcomeEmail(user.email, user.nickname || null)
    } catch (e) {
      console.error('Failed to send welcome email to', user.email, e)
    }
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, createdAt: user.created_at } })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'E-pasts vai segvārds jau reģistrēts.' })
    console.error('Register error:', error)
    res.status(500).json({ error: 'Neizdevās izveidot lietotāju.' })
  }
})
// Izveido lietotāju un mājdzīvnieku atomiski — ja viena daļa neizdodas, tiek atcelts viss
app.post('/api/create-pet', async (req, res) => {
  const { email, password, nickname, name, appearance, color, gender } = req.body
  if (!validateEmail(email) || !validatePasswordComplex(password)) return res.status(400).json({ error: 'Norādiet derīgu e-pastu un paroli (vismaz 8 rakstzīmes; jāiekļauj vismaz 1 cipars un 1 speciāls simbols).' })
  if (!name || !appearance || !color) return res.status(400).json({ error: 'Mājdzīvnieka nosaukums, izskats un krāsa ir obligāti.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const normalizedEmail = email.toLowerCase().trim()

    // Pārbauda, vai lietotājs jau eksistē
    const existing = await client.query('SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1', [normalizedEmail])
    let userId
    let createdNewUser = false
    if (existing.rows.length > 0) {
      // Pārbauda paroles atbilstību esošam kontam
      const row = existing.rows[0]
      const match = await bcrypt.compare(password, row.password_hash)
      if (!match) {
        await client.query('ROLLBACK')
        return res.status(401).json({ error: 'Nederīgi akreditācijas dati esošam kontam.' })
      }
      userId = row.id
    } else {
      // Izveido jaunu lietotāju
      let nickToStore = null
      if (nickname && typeof nickname === 'string') {
        const trimmedNick = nickname.trim().toLowerCase()
        if (trimmedNick.length < 4 || trimmedNick.length > 7) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'Segvārdam jābūt 4–7 rakstzīmēm.' })
        }
        const nickCheck = await client.query('SELECT id FROM users WHERE LOWER(nickname) = $1', [trimmedNick])
        if (nickCheck.rows.length > 0) {
          await client.query('ROLLBACK')
          return res.status(409).json({ error: 'Segvārds jau aizņemts.' })
        }
        nickToStore = trimmedNick
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const r = await client.query('INSERT INTO users (email, password_hash, role, nickname) VALUES ($1,$2,$3,$4) RETURNING id', [normalizedEmail, passwordHash, 'user', nickToStore])
      userId = r.rows[0].id
      createdNewUser = true
    }

    // Pārliecinās, ka lietotājs vēl nav izveidojis mājdzīvnieku
    const petCheck = await client.query('SELECT id FROM pets WHERE user_id = $1 LIMIT 1', [userId])
    if (petCheck.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Šim kontam jau ir mājdzīvnieks.' })
    }

    const petName = String(name).trim().substring(0, 50)

    // Normalizē izskata vērtības: pieņem 'dog'/'cat' (klienta etiķetes) un mapē uz kanoniskajām DB vērtībām ('cube' un 'pyramid').
    const appearanceInput = String(appearance || '').toLowerCase()
    const appearanceMap = {
      dog: 'cube',
      cube: 'cube',
      cat: 'pyramid',
      pyramid: 'pyramid'
    }
    const appearanceToStore = appearanceMap[appearanceInput] || appearanceInput

    // Nodrošina atļautās izskata vērtības, lai izvairītos no DB ierobežojumu kļūdām
    const allowedAppearances = ['cube', 'pyramid']
    if (!allowedAppearances.includes(appearanceToStore)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Izvēlēts nederīgs izskats.' })
    }

    const ins = await client.query('INSERT INTO pets (user_id, name, appearance, color, gender, xp, level) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, appearance, color, gender, xp, level', [userId, petName, appearanceToStore, color, gender || null, 0, 1])
    const pet = ins.rows[0]

    // Ja izveidots jauns lietotājs, piešķir starta priekšmetus
    if (createdNewUser) {
      try {
        const candies = [
          { name: 'Parasta XP konfekte', amount: 5, rarity: 'common', color: 'green', description: 'Mazs zaļš bumbiņš. Piešķir 5 XP.' },
          { name: 'Neparasta XP konfekte', amount: 10, rarity: 'uncommon', color: 'blue', description: 'Mazs zils bumbiņš. Piešķir 10 XP.' },
          { name: 'Retā XP konfekte', amount: 15, rarity: 'rare', color: 'red', description: 'Mazs sarkans bumbiņš. Piešķir 15 XP.' },
        ]
        for (const c of candies) {
          await client.query('INSERT INTO items (user_id, name, type, subtype, payload, rarity) VALUES ($1,$2,$3,$4,$5,$6)', [userId, c.name, 'consumable', 'xp', JSON.stringify({ amount: c.amount, description: c.description, appearance: 'sphere', color: c.color }), c.rarity])
        }
      } catch (e) {
        console.error('Failed to insert starter candies for user', userId, e)
      }
    }

    await client.query('COMMIT')
    if (createdNewUser) {
      try {
        await sendWelcomeEmail(normalizedEmail, nickname || null)
      } catch (e) {
        console.error('Failed to send welcome email to', normalizedEmail, e)
      }
    }
    res.status(201).json({ pet })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch (e) {}
    console.error('Create pet error:', error)
    res.status(500).json({ error: 'Neizdevās izveidot mājdzīvnieku.' })
  } finally {
    client.release()
  }
})

app.post('/api/check-email', async (req, res) => {
  const { email } = req.body
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'E-pasts ir obligāts.' })
  try {
    const normalized = email.toLowerCase().trim()
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [normalized])
    if (result.rows.length > 0) return res.json({ exists: true, user: { id: result.rows[0].id, email: result.rows[0].email } })
    return res.json({ exists: false })
  } catch (err) {
    console.error('Check email error:', err)
    res.status(500).json({ error: 'Neizdevās pārbaudīt e-pastu.' })
  }
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  if (!validateEmail(email) || !validatePassword(password))
    return res.status(400).json({ error: 'Norādiet derīgu e-pastu un paroli.' })
  try {
    const result = await pool.query('SELECT id, email, nickname, password_hash, role FROM users WHERE email = $1', [email.toLowerCase().trim()])
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'Nederīgs e-pasts vai parole.' })
    const passwordMatches = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatches) return res.status(401).json({ error: 'Nederīgs e-pasts vai parole.' })
    const petResult = await pool.query('SELECT id, name, appearance, color, gender, xp, level FROM pets WHERE user_id = $1', [user.id])
    const token = generateToken(user)
    res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role, pet: petResult.rows[0] || null } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Neizdevās pieteikties.' })
  }
})
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, nickname, role, created_at FROM users WHERE id = $1', [req.user.userId])
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    const petResult = await pool.query('SELECT id, name, appearance, color, gender, xp, level FROM pets WHERE user_id = $1', [req.user.userId])
    res.json({ user: { id: user.id, email: user.email, nickname: user.nickname, createdAt: user.created_at, pet: petResult.rows[0] || null } })
  } catch (error) {
    console.error('Profile error:', error)
    res.status(500).json({ error: 'Neizdevās ielādēt profilu.' })
  }
})
app.post('/api/check-nickname', async (req, res) => {
  const { nickname } = req.body
  if (!nickname || typeof nickname !== 'string') return res.status(400).json({ error: 'Segvārds ir obligāts.' })
  const trimmed = nickname.trim().toLowerCase()
  if (trimmed.length < 4 || trimmed.length > 7) return res.status(400).json({ error: 'Segvārdam jābūt 4–7 rakstzīmēm.' })
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE LOWER(nickname) = $1', [trimmed])
    if (result.rows.length > 0) return res.json({ exists: true, user: { id: result.rows[0].id, email: result.rows[0].email } })
    res.json({ exists: false })
  } catch (error) {
    console.error('Check nickname error:', error)
    res.status(500).json({ error: 'Neizdevās pārbaudīt segvārdu.' })
  }
})
app.post('/api/set-nickname', async (req, res) => {
  const { email, nickname } = req.body
  if (!email || !nickname || typeof nickname !== 'string') return res.status(400).json({ error: 'E-pasts un segvārds ir obligāti.' })
  const trimmed = nickname.trim().toLowerCase()
  if (trimmed.length < 4 || trimmed.length > 7) return res.status(400).json({ error: 'Segvārdam jābūt 4–7 rakstzīmēm.' })
  try {
    const checkResult = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = $1', [trimmed])
    if (checkResult.rows.length > 0) return res.status(409).json({ error: 'Segvārds jau aizņemts.' })
    await pool.query('UPDATE users SET nickname = $1 WHERE email = $2', [trimmed, email.toLowerCase().trim()])
    res.json({ success: true, nickname: trimmed })
  } catch (error) {
    console.error('Set nickname error:', error)
    res.status(500).json({ error: 'Neizdevās iestatīt segvārdu.' })
  }
})
app.delete('/api/users/:userId', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.userId])
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    if (userResult.rows[0].role !== 'moderator') return res.status(403).json({ error: 'Tikai moderatoriem ir atļauts dzēst lietotājus.' })
    const targetUserId = parseInt(req.params.userId, 10)
    if (isNaN(targetUserId)) return res.status(400).json({ error: 'Nederīgs lietotāja ID.' })
    const targetResult = await pool.query('SELECT role FROM users WHERE id = $1', [targetUserId])
    if (targetResult.rows.length === 0) return res.status(404).json({ error: 'Mērķa lietotājs nav atrasts.' })
    if (targetResult.rows[0].role === 'moderator') return res.status(403).json({ error: 'Nevar dzēst citus moderatorus.' })
    await pool.query('DELETE FROM pets WHERE user_id = $1', [targetUserId])
    await pool.query('DELETE FROM users WHERE id = $1', [targetUserId])
    res.json({ success: true, message: 'Lietotājs veiksmīgi izdzēsts.' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Neizdevās izdzēst lietotāju.' })
  }
})

app.post('/api/create-moderator', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.userId])
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    if (userResult.rows[0].role !== 'moderator') return res.status(403).json({ error: 'Tikai moderatoriem ir atļauts izveidot citus moderatorus.' })

    const { email, password } = req.body
    if (!validateEmail(email) || !validatePasswordComplex(password)) return res.status(400).json({ error: 'Norādiet derīgu e-pastu un paroli (vismaz 8 rakstzīmes; jāiekļauj vismaz 1 cipars un 1 speciāls simbols).' })

    const normalizedEmail = email.toLowerCase().trim()
    const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
    
        if (existingEmail.rows.length > 0)
          return res.status(409).json({ error: 'E-pasts jau reģistrēts.' })
    const baseNick = 'moderator'; let nick = baseNick; let counter = 1
    while (true) { const nickCheck = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = $1', [nick.toLowerCase()]); if (nickCheck.rows.length === 0) break; nick = `${baseNick}${counter}`; counter += 1 }
    const passwordHash = await bcrypt.hash(password, 10)
    const result = await pool.query('INSERT INTO users (email, password_hash, role, nickname) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at', [normalizedEmail, passwordHash, 'moderator', nick])
    const user = result.rows[0]
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, createdAt: user.created_at } })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'E-pasts jau reģistrēts.' })
    console.error('Create moderator error:', error)
    res.status(500).json({ error: 'Neizdevās izveidot moderatoru.' })
  }
})

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.userId])
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    if (userResult.rows[0].role !== 'moderator') return res.status(403).json({ error: 'Tikai moderatoriem ir atļauts skatīt visus lietotājus.' })
    const result = await pool.query('SELECT id, email, nickname, role, created_at FROM users ORDER BY created_at DESC')
    res.json({ users: result.rows })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Neizdevās iegūt lietotāju sarakstu.' })
  }
})

app.get('/api/users/search', authMiddleware, async (req, res) => {
  try {
    const rawQ = req.query.q
    const q = (rawQ || '').trim().toLowerCase()
    const userId = req.user.userId
    
    let result
    if (!q) {
      result = await pool.query(`
        SELECT id, nickname, role FROM users 
        WHERE nickname IS NOT NULL AND nickname <> '' 
        AND (role IS NULL OR role != 'moderator') 
        AND id != $1 
        AND id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $1)
        ORDER BY created_at DESC LIMIT 50`, [userId])
    } else {
      result = await pool.query(`
        SELECT id, nickname, role FROM users 
        WHERE nickname IS NOT NULL AND LOWER(nickname) LIKE $1 
        AND (role IS NULL OR role != 'moderator') 
        AND id != $2 
        AND id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $2)
        LIMIT 50`, [q + '%', userId])
    }
    res.json({ users: result.rows })
  } catch (err) {
    console.error('Search users error:', err)
    res.status(500).json({ error: 'Neizdevās meklēt lietotājus.' })
  }
})

app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query(`
      SELECT u.id, u.nickname FROM users u 
      JOIN friend_requests fr ON ((fr.from_user_id = $1 AND fr.to_user_id = u.id) OR (fr.to_user_id = $1 AND fr.from_user_id = u.id)) 
      WHERE fr.status = 'accepted'
      AND u.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $1)`, [userId])
    res.json({ friends: result.rows })
  } catch (err) {
    console.error('Get friends error:', err)
    res.status(500).json({ error: 'Neizdevās iegūt draugus.' })
  }
})

app.get('/api/friends/requests/incoming', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query('SELECT fr.id, u.id AS from_user_id, u.nickname FROM friend_requests fr JOIN users u ON fr.from_user_id = u.id WHERE fr.to_user_id = $1 AND fr.status = $2', [userId, 'pending'])
    res.json({ requests: result.rows })
  } catch (err) {
    console.error('Incoming requests error:', err)
    res.status(500).json({ error: 'Neizdevās iegūt ienākošos pieprasījumus.' })
  }
})

app.get('/api/friends/requests/outgoing', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query('SELECT fr.id, u.id AS to_user_id, u.nickname FROM friend_requests fr JOIN users u ON fr.to_user_id = u.id WHERE fr.from_user_id = $1 AND fr.status = $2', [userId, 'pending'])
    res.json({ requests: result.rows })
  } catch (err) {
    console.error('Outgoing requests error:', err)
    res.status(500).json({ error: 'Neizdevās iegūt izejošos pieprasījumus.' })
  }
})

app.post('/api/friends/request', authMiddleware, async (req, res) => {
  try {
    const { toNickname } = req.body
    if (!toNickname || typeof toNickname !== 'string') return res.status(400).json({ error: 'Mērķa segvārds ir obligāts.' })
    const targetResult = await pool.query('SELECT id, role FROM users WHERE LOWER(nickname) = $1', [toNickname.trim().toLowerCase()])
    if (targetResult.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    const targetId = targetResult.rows[0].id
    const targetRole = targetResult.rows[0].role
    if (targetRole === 'moderator') return res.status(403).json({ error: 'Nevar sūtīt draugu pieprasījumus moderatoriem.' })
    const me = req.user.userId
    if (targetId === me) return res.status(400).json({ error: 'Nevar sūtīt draugu pieprasījumu sev pašam.' })
    const existing = await pool.query('SELECT id, from_user_id, to_user_id, status FROM friend_requests WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)', [me, targetId])
    if (existing.rows.length > 0) {
      const row = existing.rows[0]
      if (row.status === 'accepted') return res.status(409).json({ error: 'Jūs jau esat draugi.' })
      if (row.status === 'pending') {
        if (row.from_user_id === targetId && row.to_user_id === me) { await pool.query('UPDATE friend_requests SET status = $1 WHERE id = $2', ['accepted', row.id]); return res.json({ accepted: true }) }
        return res.status(409).json({ error: 'Drauga pieprasījums jau gaida apstiprinājumu.' })
      }
    }
    const insert = await pool.query('INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES ($1, $2, $3) RETURNING id', [me, targetId, 'pending'])
    res.status(201).json({ requestId: insert.rows[0].id })
  } catch (err) {
    console.error('Send request error:', err)
    res.status(500).json({ error: 'Neizdevās nosūtīt drauga pieprasījumu.' })
  }
})

app.post('/api/friends/requests/:id/accept', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userId = req.user.userId
    const result = await pool.query('SELECT id, from_user_id, to_user_id, status FROM friend_requests WHERE id = $1', [id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pieprasījums nav atrasts.' })
    const row = result.rows[0]
    if (row.to_user_id !== userId) return res.status(403).json({ error: 'Nav atļauts.' })
    if (row.status !== 'pending') return res.status(400).json({ error: 'Pieprasījums nav gaidošs.' })
    await pool.query('UPDATE friend_requests SET status = $1 WHERE id = $2', ['accepted', id])
    res.json({ success: true })
  } catch (err) {
    console.error('Accept request error:', err)
    res.status(500).json({ error: 'Neizdevās pieņemt pieprasījumu.' })
  }
})

app.post('/api/friends/requests/:id/decline', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userId = req.user.userId
    const result = await pool.query('SELECT id, from_user_id, to_user_id, status FROM friend_requests WHERE id = $1', [id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pieprasījums nav atrasts.' })
    const row = result.rows[0]
    if (row.to_user_id !== userId && row.from_user_id !== userId) return res.status(403).json({ error: 'Nav atļauts.' })
    if (row.status !== 'pending') return res.status(400).json({ error: 'Pieprasījums nav gaidošs.' })
    await pool.query('UPDATE friend_requests SET status = $1 WHERE id = $2', ['declined', id])
    res.json({ success: true })
  } catch (err) {
    console.error('Decline request error:', err)
    res.status(500).json({ error: 'Neizdevās noraidīt pieprasījumu.' })
  }
})

app.post('/api/friends/requests/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userId = req.user.userId
    const result = await pool.query('SELECT id, from_user_id, to_user_id, status FROM friend_requests WHERE id = $1', [id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pieprasījums nav atrasts.' })
    const row = result.rows[0]
    if (row.from_user_id !== userId) return res.status(403).json({ error: 'Nav atļauts.' })
    if (row.status !== 'pending') return res.status(400).json({ error: 'Pieprasījumu nevar atcelt.' })
    await pool.query('DELETE FROM friend_requests WHERE id = $1', [id])
    res.json({ success: true })
  } catch (err) {
    console.error('Cancel request error:', err)
    res.status(500).json({ error: 'Neizdevās atcelt pieprasījumu.' })
  }
})

// Block a user
app.post('/api/users/block', authMiddleware, async (req, res) => {
  try {
    const { nickname } = req.body
    if (!nickname || typeof nickname !== 'string') return res.status(400).json({ error: 'Segvārds ir obligāts.' })
    
    const targetResult = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = $1', [nickname.trim().toLowerCase()])
    if (targetResult.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    
    const targetId = targetResult.rows[0].id
    const blockerId = req.user.userId
    
    if (targetId === blockerId) return res.status(400).json({ error: 'Nevar bloķēt sevi.' })
    
    // Check if already blocked
    const existing = await pool.query('SELECT id FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, targetId])
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Lietotājs jau ir bloķēts.' })
    
    await pool.query('INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2)', [blockerId, targetId])
    
    // Remove any friend relationship
    await pool.query('DELETE FROM friend_requests WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)', [blockerId, targetId])
    
    res.json({ success: true })
  } catch (err) {
    console.error('Block user error:', err)
    res.status(500).json({ error: 'Neizdevās bloķēt lietotāju.' })
  }
})

// Unblock a user
app.post('/api/users/unblock', authMiddleware, async (req, res) => {
  try {
    const { nickname } = req.body
    if (!nickname || typeof nickname !== 'string') return res.status(400).json({ error: 'Segvārds ir obligāts.' })
    
    const targetResult = await pool.query('SELECT id FROM users WHERE LOWER(nickname) = $1', [nickname.trim().toLowerCase()])
    if (targetResult.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav atrasts.' })
    
    const targetId = targetResult.rows[0].id
    const blockerId = req.user.userId
    
    const result = await pool.query('DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id', [blockerId, targetId])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lietotājs nav bloķēts.' })
    
    res.json({ success: true })
  } catch (err) {
    console.error('Unblock user error:', err)
    res.status(500).json({ error: 'Neizdevās atbloķēt lietotāju.' })
  }
})

// Get blocked users list
app.get('/api/users/blocked', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query('SELECT u.id, u.nickname FROM blocked_users bu JOIN users u ON bu.blocked_id = u.id WHERE bu.blocker_id = $1', [userId])
    res.json({ blocked: result.rows })
  } catch (err) {
    console.error('Get blocked users error:', err)
    res.status(500).json({ error: 'Neizdevās iegūt bloķētos lietotājus.' })
  }
})

const ensureTaskTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        duration_seconds INTEGER,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_participants (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP NULL,
        UNIQUE (task_id, user_id)
      );
    `)
    try {
      const dupGroups = await pool.query(`SELECT created_by_user_id, LOWER(title) AS title_lower, array_agg(id ORDER BY id) AS ids FROM tasks GROUP BY created_by_user_id, LOWER(title) HAVING COUNT(*) > 1`)
      for (const g of dupGroups.rows) {
        const ids = g.ids
        if (!ids || ids.length < 2) continue
        const keepId = ids[0]
        const otherIds = ids.slice(1)
        try {
          const participants = await pool.query(`SELECT tp.user_id, bool_or(tp.completed) AS completed, max(tp.completed_at) AS completed_at FROM task_participants tp WHERE tp.task_id = ANY($1) GROUP BY tp.user_id`, [ids])
          for (const p of participants.rows) {
            const updateRes = await pool.query('UPDATE task_participants SET completed = completed OR $3, completed_at = COALESCE(completed_at, $4) WHERE task_id = $1 AND user_id = $2', [keepId, p.user_id, p.completed, p.completed_at])
            if (updateRes.rowCount === 0) {
              await pool.query('INSERT INTO task_participants (task_id, user_id, completed, completed_at) VALUES ($1, $2, $3, $4)', [keepId, p.user_id, p.completed, p.completed_at])
            }
          }
          if (otherIds.length > 0) await pool.query('DELETE FROM tasks WHERE id = ANY($1)', [otherIds])
        } catch (innerErr) {
          console.error('Error merging duplicate tasks for group', g, innerErr)
        }
      }
    } catch (dupErr) {
      console.error('Failed to check/merge duplicate tasks:', dupErr)
    }
    try { await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS tasks_creator_title_unique ON tasks (created_by_user_id, LOWER(title))") } catch (idxErr) { console.error('Failed creating unique index for tasks:', idxErr) }
    try { await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE") } catch (colErr) { console.error('Failed ensuring is_system column for tasks:', colErr) }
  } catch (err) { console.error('Failed to ensure task tables:', err) }
}
ensureTaskTables()

const ensureSystemUserAndTasks = async () => {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'")
    let sys = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", ['system@pets.local'])
    let systemUserId
    if (sys.rows.length === 0) {
      const pw = await bcrypt.hash('systempassword', 8)
      const ins = await pool.query('INSERT INTO users (email, password_hash, role, nickname) VALUES ($1,$2,$3,$4) RETURNING id', ['system@pets.local', pw, 'system', 'system'])
      systemUserId = ins.rows[0].id
    } else {
      systemUserId = sys.rows[0].id
    }
    const createSystemTaskForAllUsers = async () => {
      try {
        const users = await pool.query("SELECT id, nickname, email FROM users WHERE role IS NULL OR role != 'moderator' AND id != $1", [systemUserId])
        const titles = ['Community Quest', 'Daily Challenge', 'Server Bonus']
        for (const u of users.rows) {
          const title = `${titles[Math.floor(Math.random() * titles.length)]} — ${u.id}`
          const xp = Math.floor(Math.random() * 6) + 2
          const duration = (Math.floor(Math.random() * 10) + 1) * 60
          try {
            const t = await pool.query('INSERT INTO tasks (title, xp, duration_seconds, created_by_user_id, is_shared, is_system) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [title, xp, duration, systemUserId, false, true])
            const taskId = t.rows[0].id
            await pool.query('INSERT INTO task_participants (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [taskId, u.id])
          } catch (e) {}
        }
      } catch (e) { console.error('Failed to create system tasks for users:', e) }
    }
    createSystemTaskForAllUsers()
    setInterval(createSystemTaskForAllUsers, 30 * 60 * 1000)
  } catch (err) { console.error('Failed ensuring system user/tasks:', err) }
}
ensureSystemUserAndTasks()

// Uzdevumu (tasks) API: iegūst un pārvalda lietotāja uzdevumus un balvas
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query(
      `SELECT t.id, t.title, t.xp, t.duration_seconds, t.created_at, t.is_shared, t.is_system, tp.completed, tp.completed_at, t.created_by_user_id, (SELECT bool_and(tp2.completed) FROM task_participants tp2 WHERE tp2.task_id = t.id) AS all_completed FROM tasks t JOIN task_participants tp ON t.id = tp.task_id WHERE tp.user_id = $1 ORDER BY t.created_at DESC`,
      [userId]
    )
    const tasks = result.rows.map((r) => {
      const createdMs = new Date(r.created_at).getTime()
      const nowMs = Date.now()
      const elapsedSec = Math.floor((nowMs - createdMs) / 1000)
      const remainingSeconds = r.duration_seconds != null ? Math.max(r.duration_seconds - elapsedSec, 0) : null
      return {
        id: r.id,
        title: r.title,
        xp: r.xp,
        durationSeconds: r.duration_seconds,
        createdAt: r.created_at,
        isShared: r.is_shared,
        isSystem: r.is_system,
        completed: r.completed,
        allCompleted: r.all_completed,
        completedAt: r.completed_at,
        createdBy: r.created_by_user_id,
        remainingSeconds,
      }
    })
    res.json({ tasks })
  } catch (err) {
    console.error('Get tasks error:', err)
    res.status(500).json({ error: 'Neizdevās iegūt uzdevumus.' })
  }
})

app.post('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const { title, xp = 5, durationSeconds = null, friendId = null } = req.body
    const xpValueToStore = Math.min(10, Math.max(0, parseInt(xp, 10) || 0))
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'Uzdevuma nosaukums ir obligāts.' })
    let isShared = false
    const participants = [userId]
    if (friendId) {
      const friendIdNum = parseInt(friendId, 10)
      if (isNaN(friendIdNum)) return res.status(400).json({ error: 'Nederīgs drauga ID.' })
      const friendship = await pool.query(
        `SELECT id FROM friend_requests WHERE ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)) AND status = $3`,
        [userId, friendIdNum, 'accepted']
      )
      if (friendship.rows.length === 0) return res.status(403).json({ error: 'Jūs neesat draugs ar šo lietotāju.' })
      isShared = true
      participants.push(friendIdNum)
    }
    const titleTrim = title.trim().substring(0, 255)
    let task
    try {
      const insertTask = await pool.query(
        'INSERT INTO tasks (title, xp, duration_seconds, created_by_user_id, is_shared) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, xp, duration_seconds, created_at, is_shared',
        [titleTrim, xpValueToStore, durationSeconds, userId, isShared]
      )
      task = insertTask.rows[0]
    } catch (err) {
      if (err.code === '23505') {
        const existing = await pool.query(
          'SELECT id, title, xp, duration_seconds, created_at, is_shared FROM tasks WHERE created_by_user_id = $1 AND title = $2 LIMIT 1',
          [userId, titleTrim]
        )
        task = existing.rows[0]
      } else throw err
    }
    for (const uId of participants) {
      await pool.query('INSERT INTO task_participants (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [task.id, uId])
    }
    res.status(201).json({ task })
  } catch (err) {
    console.error('Create task error:', err)
    res.status(500).json({ error: 'Neizdevās izveidot uzdevumu.' })
  }
})

app.post('/api/tasks/:id/complete', authMiddleware, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userId = req.user.userId
    const taskId = parseInt(req.params.id, 10)
    if (isNaN(taskId)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Nederīgs uzdevuma ID.' })
    }
    const rowRes = await client.query(
      'SELECT tp.id AS tp_id, tp.completed, t.xp, t.is_shared, t.is_system FROM task_participants tp JOIN tasks t ON t.id = tp.task_id WHERE tp.task_id = $1 AND tp.user_id = $2 FOR UPDATE',
      [taskId, userId]
    )
    if (rowRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Uzdevums vai dalībnieks nav atrasts.' })
    }
    const row = rowRes.rows[0]
    if (row.completed) {
      await client.query('COMMIT')
      return res.json({ success: true, message: 'Jau pabeigts.' })
    }
    await client.query('UPDATE task_participants SET completed = $1, completed_at = NOW() WHERE id = $2', [true, row.tp_id])
    const allRes = await client.query('SELECT bool_and(completed) AS all_completed FROM task_participants WHERE task_id = $1', [taskId])
    const allCompleted = allRes.rows[0].all_completed

    const pickSystemDrop = () => {
      const drops = [
        { name: 'Mazs XP komplekts', type: 'consumable', subtype: 'xp', payload: { amount: 10 } },
        { name: 'Sasalšanas taimeris', type: 'consumable', subtype: 'freeze', payload: { durationSeconds: 15 } },
        { name: 'XP pastiprinājums', type: 'consumable', subtype: 'boost', payload: { multiplier: 1.5, uses: 3, expiresHours: 24 } },
      ]
      return drops[Math.floor(Math.random() * drops.length)]
    }

    const handleAwardToUser = async (uId, baseXp) => {
      const petRow = await client.query('SELECT id, xp, level FROM pets WHERE user_id = $1 FOR UPDATE', [uId])
      const prevXp = petRow.rows.length > 0 ? (petRow.rows[0].xp || 0) : 0
      const prevLevel = getLevelProgress(prevXp).level
      const boostRes = await client.query(
        "SELECT id, multiplier, uses_remaining, expires_at FROM active_effects WHERE user_id = $1 AND effect_type = 'boost' AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [uId]
      )
      let multiplier = 1
      let boostRow = null
      if (boostRes.rows.length > 0) {
        boostRow = boostRes.rows[0]
        multiplier = Number(boostRow.multiplier) || 1
      }
      const xpToApply = Math.round(Math.min(10, parseInt(baseXp, 10) || 0) * multiplier)
      const petUpdate = await client.query('UPDATE pets SET xp = COALESCE(xp,0) + $1 WHERE user_id = $2 RETURNING id, xp', [xpToApply, uId])
      const newXp = petUpdate.rows.length > 0 ? petUpdate.rows[0].xp : prevXp
      if (boostRow) {
        if (boostRow.uses_remaining == null) {
        } else if (boostRow.uses_remaining <= 1) {
          await client.query('DELETE FROM active_effects WHERE id = $1', [boostRow.id])
        } else {
          await client.query('UPDATE active_effects SET uses_remaining = uses_remaining - 1 WHERE id = $1', [boostRow.id])
        }
      }
      const newLevel = getLevelProgress(newXp).level
      let awardedItem = null
      if (newLevel > prevLevel) {
        await client.query('UPDATE pets SET level = $1 WHERE user_id = $2', [newLevel, uId])
        const itemName = `Līmeņa ${newLevel} balva`
        const insertIt = await client.query('INSERT INTO items (user_id, name, type, subtype, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id', [uId, itemName, 'eternal', 'level', JSON.stringify({ level: newLevel })])
        awardedItem = insertIt.rows[0]
      }
      return { userId: uId, xpApplied: xpToApply, prevXp, newXp, levelUp: newLevel > prevLevel, awardedItem }
    }

    if (row.is_shared) {
      if (!allCompleted) {
        await client.query('COMMIT')
        return res.json({ success: true, message: 'Atzīmēts kā pabeigts. Gaida pārējos dalībniekus.', allCompleted: false })
      }
      const parts = await client.query('SELECT user_id FROM task_participants WHERE task_id = $1', [taskId])
      const userIds = parts.rows.map((r) => r.user_id)
      const results = []
      for (const uId of userIds) {
        const r = await handleAwardToUser(uId, row.xp)
        results.push(r)
      }
      const awardedItems = []
      for (const uId of userIds) {
        const chance = row.is_system ? 0.15 : 0.05
        if (Math.random() < chance) {
          const drop = pickSystemDrop()
          const insertIt = await client.query('INSERT INTO items (user_id, name, type, subtype, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id', [uId, drop.name, drop.type, drop.subtype, JSON.stringify(drop.payload)])
          awardedItems.push({ userId: uId, itemId: insertIt.rows[0].id })
        }
      }
      await client.query('COMMIT')
      return res.json({ success: true, allCompleted: true, results, awardedItems })
    }

    const singleResult = await handleAwardToUser(userId, row.xp)
    let dropAward = null
    const dropChance = row.is_system ? 0.15 : 0.05
    if (Math.random() < dropChance) {
      const drop = pickSystemDrop()
      const insertIt = await client.query('INSERT INTO items (user_id, name, type, subtype, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, type, subtype, payload', [userId, drop.name, drop.type, drop.subtype, JSON.stringify(drop.payload)])
      dropAward = insertIt.rows[0]
    }
    await client.query('COMMIT')
    return res.json({ success: true, xpAwarded: singleResult.xpApplied, petXp: singleResult.newXp, levelUp: singleResult.levelUp, awardedItem: singleResult.awardedItem, dropAward })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (e) {
    }
    console.error('Complete task error:', err)
    res.status(500).json({ error: 'Neizdevās pabeigt uzdevumu.' })
  } finally {
    client.release()
  }
})

app.post('/api/tasks/seed', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const defaults = [
      { title: 'Get out of bed', xp: 8, durationSeconds: 60 * 60 },
      { title: 'Brush your teeth', xp: 5, durationSeconds: 60 * 10 },
      { title: 'Drink a glass of water', xp: 3, durationSeconds: 60 * 5 },
      { title: 'Make your bed', xp: 4, durationSeconds: 60 * 10 },
    ]
    for (const t of defaults) {
      const titleTrim = t.title.trim()
      let taskId = null
      const found = await pool.query('SELECT id FROM tasks WHERE created_by_user_id = $1 AND title = $2 LIMIT 1', [userId, titleTrim])
      if (found.rows.length > 0) {
        taskId = found.rows[0].id
      } else {
        try {
          const it = await pool.query('INSERT INTO tasks (title, xp, duration_seconds, created_by_user_id, is_shared) VALUES ($1, $2, $3, $4, $5) RETURNING id', [titleTrim, t.xp, t.durationSeconds, userId, false])
          taskId = it.rows[0].id
        } catch (e) {
          if (e.code === '23505') {
            const sel = await pool.query('SELECT id FROM tasks WHERE created_by_user_id = $1 AND title = $2 LIMIT 1', [userId, titleTrim])
            if (sel.rows.length > 0) taskId = sel.rows[0].id
          } else {
            throw e
          }
        }
      }
      if (taskId) {
        await pool.query('INSERT INTO task_participants (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [taskId, userId])
      }
    }
    res.json({ seeded: true })
  } catch (err) {
    console.error('Seed tasks error:', err)
    res.status(500).json({ error: 'Neizdevās izveidot parauga uzdevumus.' })
  }
})

// Inventāra API: items — iegūšana, izveide, dzēšana un izmantošana
app.get('/api/inventory', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query(
      'SELECT id, name, type, subtype, payload, rarity, created_at FROM items WHERE user_id = $1 AND (consumed IS NULL OR consumed = FALSE) ORDER BY created_at DESC',
      [userId]
    )
    res.json({ items: result.rows })
  } catch (err) {
    console.error('Get inventory error:', err)
    res.status(500).json({ error: 'Neizdevās iegūt inventāru.' })
  }
})

app.post('/api/inventory/create', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const { name, type = 'consumable', subtype = null, payload = {}, rarity = 'common' } = req.body
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Nederīgs nosaukums' })
    const insert = await pool.query(
      'INSERT INTO items (user_id, name, type, subtype, payload, rarity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, type, subtype, payload, rarity',
      [userId, name, type, subtype, JSON.stringify(payload), rarity]
    )
    res.status(201).json({ item: insert.rows[0] })
  } catch (err) {
    console.error('Create item error:', err)
    res.status(500).json({ error: 'Neizdevās izveidot priekšmetu.' })
  }
})

app.delete('/api/inventory/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: 'Nederīgs ID' })
    await pool.query('DELETE FROM items WHERE id = $1 AND user_id = $2', [id, userId])
    res.json({ success: true })
  } catch (err) {
    console.error('Delete item error:', err)
    res.status(500).json({ error: 'Neizdevās izdzēst priekšmetu.' })
  }
})

app.post('/api/inventory/use/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userId = req.user.userId
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Nederīgs ID' })
    }
    const rowRes = await client.query('SELECT id, name, type, subtype, payload, consumed FROM items WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId])
    if (rowRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Priekšmets nav atrasts' })
    }
    const item = rowRes.rows[0]
    if (item.consumed) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Priekšmets jau izmantots' })
    }
    if (item.type === 'consumable') {
      try {
        await client.query('DELETE FROM items WHERE id = $1', [id])
      } catch (delErr) {
        console.error('Failed deleting consumed item', id, delErr)
        try {
          await client.query('UPDATE items SET consumed = TRUE WHERE id = $1', [id])
        } catch (uErr) {
          console.error('Also failed to mark consumed', id, uErr)
        }
      }
    }
    const payload = item.payload || {}
    if (item.subtype === 'xp') {
      const amount = Number(payload.amount) || 0
      const petRow = await client.query('SELECT id, xp, level FROM pets WHERE user_id = $1 FOR UPDATE', [userId])
      const prevXp = petRow.rows.length > 0 ? (petRow.rows[0].xp || 0) : 0
      const prevLevel = getLevelProgress(prevXp).level
      const petUpdate = await client.query('UPDATE pets SET xp = COALESCE(xp,0) + $1 WHERE user_id = $2 RETURNING id, xp', [amount, userId])
      const newXp = petUpdate.rows.length > 0 ? petUpdate.rows[0].xp : prevXp
      let levelUp = false
      if (getLevelProgress(newXp).level > prevLevel) {
        const newLevel = getLevelProgress(newXp).level
        await client.query('UPDATE pets SET level = $1 WHERE user_id = $2', [newLevel, userId])
        await client.query('INSERT INTO items (user_id, name, type, subtype, payload) VALUES ($1,$2,$3,$4,$5)', [userId, `Level ${newLevel} Reward`, 'eternal', 'level', JSON.stringify({ level: newLevel })])
        levelUp = true
      }
      await client.query('COMMIT')
      return res.json({ success: true, effect: { type: 'xp', amount }, petXp: newXp, levelUp })
    }
    if (item.subtype === 'freeze') {
      const dur = Number(payload.durationSeconds) || 10
      const expiresAt = new Date(Date.now() + dur * 1000)
      await client.query('INSERT INTO active_effects (user_id, effect_type, multiplier, uses_remaining, expires_at) VALUES ($1,$2,$3,$4,$5)', [userId, 'freeze', 1, 1, expiresAt])
      await client.query('COMMIT')
      return res.json({ success: true, effect: { type: 'freeze', durationSeconds: dur } })
    }
    if (item.subtype === 'boost') {
      const mult = Number(payload.multiplier) || 1.5
      const uses = parseInt(payload.uses, 10) || 1
      const hours = parseInt(payload.expiresHours, 10) || null
      const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null
      await client.query('INSERT INTO active_effects (user_id, effect_type, multiplier, uses_remaining, expires_at) VALUES ($1,$2,$3,$4,$5)', [userId, 'boost', mult, uses, expiresAt])
      await client.query('COMMIT')
      return res.json({ success: true, effect: { type: 'boost', multiplier: mult, uses } })
    }
    await client.query('COMMIT')
    return res.json({ success: true })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (e) {
    }
    console.error('Use item error:', err)
    res.status(500).json({ error: 'Neizdevās izmantot priekšmetu.' })
  } finally {
    client.release()
  }
})

// Sākt express serveri norādītajā portā
app.listen(PORT, () => console.log(`Autentifikācijas backend klausās uz http://localhost:${PORT}`))

// SPA fallback: serve index.html for all non-API routes (must be last route)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})
