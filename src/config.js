/**
 * Frontend runtime config.
 *
 * VITE_API_URL is only used on localhost.
 * On any live host, always use relative /exec (same origin as the page).
 * Important: www.steamoji.online and steamoji.online are different origins —
 * never use an absolute https://steamoji.online/exec URL in production.
 */

function normalizeApiUrl(raw) {
  let url = (raw || 'http://localhost:4000/exec').trim()
  url = url.replace(/\/+$/, '')
  if (!url.endsWith('/exec')) {
    url += '/exec'
  }
  return url
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/** Called at request time so the URL always matches the current host (www or not). */
export function getApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL?.trim()

  if (typeof window !== 'undefined' && !isLocalHost(window.location.hostname)) {
    return '/exec'
  }

  return normalizeApiUrl(fromEnv || 'http://localhost:4000/exec')
}

const config = {
  ADMIN_PASS: import.meta.env.VITE_ADMIN_PASS || '8031',
  ATTEND_PASS: import.meta.env.VITE_ATTEND_PASS || '8031',

  WORKSTATIONS: [1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20],

  GOOGLE_SHEETS: {
    get API_URL() {
      return getApiUrl()
    },
  },
}

export default config
