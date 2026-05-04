import cron from 'node-cron'
import dotenv from 'dotenv'
import { Pool } from 'pg'
import { sendEmail } from '../utils/email.js'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false })

async function ensureEmailNotificationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, task_id, type)
      );
    `)
  } catch (err) {
    console.error('Failed to ensure email_notifications table:', err)
  }
}

async function checkAndSendReminders() {
  try {
    const q = `
      SELECT t.id AS task_id, t.title, t.duration_seconds, t.created_at,
             tp.user_id, u.email, u.nickname,
             EXTRACT(EPOCH FROM (t.created_at + (t.duration_seconds * INTERVAL '1 second') - NOW())) AS seconds_until_due
      FROM tasks t
      JOIN task_participants tp ON tp.task_id = t.id
      JOIN users u ON u.id = tp.user_id
      WHERE t.duration_seconds IS NOT NULL
        AND tp.completed = false
        AND (t.created_at + (t.duration_seconds * INTERVAL '1 second')) <= (NOW() + INTERVAL '24 hours')
        AND (t.created_at + (t.duration_seconds * INTERVAL '1 second')) > NOW()
        AND NOT EXISTS (SELECT 1 FROM email_notifications en WHERE en.user_id = tp.user_id AND en.task_id = t.id AND en.type = 'reminder')
      LIMIT 200
    `
    const res = await pool.query(q)
    if (!res.rows || res.rows.length === 0) return
    for (const row of res.rows) {
      try {
        const to = row.email
        if (!to) continue
        const minutes = Math.max(1, Math.round((row.seconds_until_due || 0) / 60))
        const subject = `Uzdevums "${row.title}" drīz jāizpilda`
        const html = `<p>Sveiki ${row.nickname || ''},</p><p>Jūsu uzdevums <strong>${row.title}</strong> jāizpilda aptuveni pēc ${minutes} minūtēm.</p><p>Atveriet lietotni, lai to pabeigtu un nopelnītu XP savam mājdzīvniekam.</p>`
        const text = `Sveiki ${row.nickname || ''},\n\nJūsu uzdevums "${row.title}" jāizpilda aptuveni pēc ${minutes} minūtēm.\n\nAtveriet lietotni, lai to pabeigtu un nopelnītu XP savam mājdzīvniekam.`
        await sendEmail({ to, subject, text, html })
        await pool.query('INSERT INTO email_notifications (user_id, task_id, type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [row.user_id, row.task_id, 'reminder'])
      } catch (e) {
        console.error('Failed to send reminder for task', row.task_id, 'to user', row.user_id, e)
      }
    }
  } catch (err) {
    console.error('Task reminder check failed:', err)
  }
}

(async () => {
  try {
    await ensureEmailNotificationsTable()
    // Palaist vienreiz uzreiz palaišanas brīdī
    await checkAndSendReminders()
    // Plāno izpildi ik pēc 15 minūtēm
    cron.schedule('*/15 * * * *', async () => {
      try {
        await checkAndSendReminders()
      } catch (e) {
        console.error('Scheduled reminder job error:', e)
      }
    })
  } catch (e) {
    console.error('Failed to start task reminder job:', e)
  }
})()
