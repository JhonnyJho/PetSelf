import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
dotenv.config()

const DEFAULT_FROM = process.env.EMAIL_FROM || 'PetSelf <no-reply@petself.local>'

let transporterPromise = null

async function initTransporter() {
  if (process.env.SMTP_HOST) {
    const opts = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
    }
    if (process.env.SMTP_USER || process.env.SMTP_PASS) {
      opts.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    }
    console.log('Email: using SMTP host', process.env.SMTP_HOST)
    return nodemailer.createTransport(opts)
  }
  // Noklusējuma variants: Ethereal testa konts lokālai izstrādei
  const testAccount = await nodemailer.createTestAccount()
  const t = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: { user: testAccount.user, pass: testAccount.pass }
  })
  console.log('Email: using Ethereal test account for previews')
  return t
}

async function getTransporter() {
  if (!transporterPromise) transporterPromise = initTransporter()
  return transporterPromise
}

export async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    console.warn('sendEmail called without `to` address:', { subject })
    throw new Error('Missing recipient')
  }
  const transporter = await getTransporter()
  try {
    console.log('Sending email to:', to, 'subject:', subject)
    const info = await transporter.sendMail({ from: process.env.EMAIL_FROM || DEFAULT_FROM, to, subject, text, html })
    console.log('Email sent; messageId:', info && info.messageId)
    const preview = nodemailer.getTestMessageUrl(info)
    if (preview) console.log('Email preview URL:', preview)
    return info
  } catch (err) {
    console.error('sendEmail error for', to, err)
    throw err
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

export async function sendWelcomeEmail(to, nickname) {
  const name = nickname ? escapeHtml(nickname) : to.split('@')[0]
  const subject = 'Laipni lūdzam PetSelf!'
  const html = `<p>Sveiki ${name},</p><p>Laipni lūdzam <strong>PetSelf</strong> — jūsu jaunajā virtuālajā mājdzīvnieku pasaulē. Jūsu konts <strong>${escapeHtml(to)}</strong> ir gatavs.</p><p>Sāciet, piesakoties un izveidojot savu mājdzīvnieku. Lai labi pavadīts laiks!</p><p>— PetSelf komanda</p>`
  const text = `Sveiki ${name},\n\nLaipni lūdzam PetSelf — jūsu jaunajā virtuālajā mājdzīvnieku pasaulē. Jūsu konts ${to} ir gatavs.\n\nSāciet, piesakoties un izveidojot savu mājdzīvnieku.\n\n— PetSelf komanda`
  return sendEmail({ to, subject, text, html })
}
