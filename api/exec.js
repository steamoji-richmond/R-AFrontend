/**
 * Vercel serverless proxy: /exec → GCP backend.
 * Avoids 307 redirects from direct external rewrites and mixed-content issues.
 *
 * Set BACKEND_URL in Vercel env (e.g. http://35.233.224.158:4000)
 */
const BACKEND_URL = (process.env.BACKEND_URL || 'http://35.233.224.158:4000').replace(
  /\/+$/,
  ''
)

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  const qIndex = req.url.indexOf('?')
  const qs = qIndex >= 0 ? req.url.slice(qIndex) : ''
  const target = `${BACKEND_URL}/exec${qs}`

  try {
    const headers = {}
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type']
    }
    if (req.headers.accept) {
      headers.Accept = req.headers.accept
    }

    let body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await readRawBody(req)
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body?.length ? body : undefined,
    })

    const text = await upstream.text()
    res.status(upstream.status)
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.send(text)
  } catch (err) {
    console.error('[exec proxy]', target, err)
    res.status(502).json({
      success: false,
      error: `Backend unreachable: ${err.message}`,
    })
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
