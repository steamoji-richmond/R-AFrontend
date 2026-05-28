/**
 * Frontend runtime config.
 *
 * VITE_API_URL in .env is only used on localhost.
 * On steamoji.online (and any live host), API calls always go to /exec
 * (Vercel serverless proxy → GCP) to avoid CORS and mixed-content errors.
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

function isIpAddressUrl(url) {
  try {
    const { hostname } = new URL(url)
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  } catch {
    return false
  }
}

/** Called at request time — never rely on a URL baked in at module load. */
export function getApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL?.trim()

  if (typeof window === 'undefined') {
    return normalizeApiUrl(fromEnv || 'http://localhost:4000/exec')
  }

  const { hostname } = window.location

  if (isLocalHost(hostname)) {
    return normalizeApiUrl(fromEnv || 'http://localhost:4000/exec')
  }

  // Live site: use same-origin proxy unless env is a real HTTPS API domain
  if (
    !fromEnv ||
    fromEnv.startsWith('/') ||
    fromEnv.startsWith('http://') ||
    isIpAddressUrl(fromEnv)
  ) {
    return '/exec'
  }

  return normalizeApiUrl(fromEnv)
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
