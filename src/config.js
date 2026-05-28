/**
 * Frontend runtime config.
 *
 * VITE_API_URL is only used on localhost.
 * On any live host, always use relative /exec (same origin as the page).
 *
 * Admin/attendance passwords live on the backend only — never in this file.
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

export default {
  GOOGLE_SHEETS: {
    get API_URL() {
      return getApiUrl()
    },
  },
}
