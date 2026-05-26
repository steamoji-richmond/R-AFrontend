/**
 * Frontend runtime config.
 *
 * Override via frontend/.env — see .env.example
 *   VITE_API_URL       → backend /exec endpoint (MUST end with /exec)
 *   VITE_ADMIN_PASS    → admin panel unlock password
 *   VITE_ATTEND_PASS   → attendance/scanner unlock password
 *
 * GCP / production tip: if nginx proxies /exec to the backend on the same
 * domain, set VITE_API_URL=/exec (relative URL, no CORS issues).
 */

function normalizeApiUrl(raw) {
  let url = (raw || 'http://localhost:4000/exec').trim()
  // Strip trailing slashes, then ensure /exec suffix
  url = url.replace(/\/+$/, '')
  if (!url.endsWith('/exec')) {
    url += '/exec'
  }
  return url
}

const config = {
  ADMIN_PASS: import.meta.env.VITE_ADMIN_PASS || '8031',
  ATTEND_PASS: import.meta.env.VITE_ATTEND_PASS || '8031',

  WORKSTATIONS: [1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20],

  GOOGLE_SHEETS: {
    API_URL: normalizeApiUrl(import.meta.env.VITE_API_URL),
  },
}

export default config
