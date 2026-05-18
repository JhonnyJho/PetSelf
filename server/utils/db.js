import { URL } from 'url'

function parseBool(value, fallback = false) {
  if (value == null) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function sslModeFromConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString)
    const sslmode = (parsed.searchParams.get('sslmode') || '').trim().toLowerCase()
    return sslmode || null
  } catch (_) {
    return null
  }
}

function resolveSslMode(connectionString) {
  const mode = (process.env.DATABASE_SSL_MODE || '').trim().toLowerCase()
  if (mode) return mode

  // Backward-compatibility toggle.
  if (process.env.DATABASE_SSL != null) {
    return parseBool(process.env.DATABASE_SSL, false) ? 'no-verify' : 'disable'
  }

  return sslModeFromConnectionString(connectionString) || 'disable'
}

export function resolvePgPoolConfig(connectionString) {
  const sslMode = resolveSslMode(connectionString)
  let ssl = false

  if (sslMode === 'no-verify' || sslMode === 'require') {
    ssl = { rejectUnauthorized: false }
  } else if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
    const rejectUnauthorized = parseBool(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, true)
    ssl = { rejectUnauthorized }
  } else if (sslMode !== 'disable' && sslMode !== 'allow' && sslMode !== 'prefer' && sslMode !== '') {
    console.warn(`Unknown DATABASE_SSL_MODE="${sslMode}", falling back to disable.`)
  }

  return { connectionString, ssl }
}

