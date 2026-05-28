/**
 * Frontend runtime config.
 *
 * Override via frontend/.env — see .env.example
 *   VITE_API_URL       → backend /exec endpoint (MUST end with /exec)
 *   VITE_ADMIN_PASS    → admin panel unlock password
 *   VITE_ATTEND_PASS   → attendance/scanner unlock password
 *
 * On HTTPS production (e.g. steamoji.online), uses /exec → Vercel proxy → GCP.
 */

function normalizeApiUrl(raw) {
  let url = (raw || 'http://localhost:4000/exec').trim()
  url = url.replace(/\/+$/, '')
  if (!url.endsWith('/exec')) {
    url += '/exec'
  }
  return url
}

function resolveApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL?.trim()

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'

    if (!isLocal && protocol === 'https:') {
      if (!fromEnv || fromEnv.startsWith('/') || fromEnv.startsWith('http://')) {
        return '/exec'
      }
    }
  }

  return normalizeApiUrl(fromEnv || 'http://localhost:4000/exec')
}

const config = {
  ADMIN_PASS: import.meta.env.VITE_ADMIN_PASS || '8031',
  ATTEND_PASS: import.meta.env.VITE_ATTEND_PASS || '8031',

  WORKSTATIONS: [1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20],

  GOOGLE_SHEETS: {
    API_URL: resolveApiUrl(),
  },
}

export default config
