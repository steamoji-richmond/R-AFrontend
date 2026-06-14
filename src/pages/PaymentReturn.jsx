import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { confirmPayment } from '../api/sheets.js'

export default function PaymentReturn() {
  const [params] = useSearchParams()
  const regId = params.get('reg')
  const [status, setStatus] = useState('verifying') // 'verifying' | 'paid' | 'pending' | 'error'
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!regId) {
      setStatus('error')
      setMessage('No registration ID found in the return URL.')
      return
    }

    let cancelled = false

    async function verifyWithRetries() {
      const maxAttempts = 5
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await confirmPayment(regId)
          if (cancelled) return

          if (result.paid) {
            setStatus('paid')
            setMessage('Your payment was received and your registration is confirmed!')
            return
          }

          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 2000))
            continue
          }

          setStatus('pending')
          setMessage(
            'Payment not yet confirmed. If you completed payment, it may take a moment to process — please check back shortly. If you did not complete payment, your registration is still pending.'
          )
        } catch (err) {
          if (cancelled) return
          console.error('confirmPayment error', err)
          setStatus('error')
          setMessage(
            'There was an error verifying your payment: ' +
              (err.message || 'Unknown error') +
              '. Please contact support.'
          )
          return
        }
      }
    }

    verifyWithRetries()
    return () => {
      cancelled = true
    }
  }, [regId])

  return (
    <section id="payment-return">
      <div className="panel" style={{ maxWidth: 520, margin: '40px auto' }}>
        <h2>Payment Status</h2>

        {status === 'verifying' && (
          <p className="muted">Verifying your payment, please wait…</p>
        )}

        {status === 'paid' && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--success, #28a745)',
                fontWeight: 600,
                fontSize: '1.05rem',
                marginBottom: 12,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 22, height: 22, flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              Payment Confirmed
            </div>
            <p>{message}</p>
            <Link to="/register">
              <button className="primary" style={{ marginTop: 8 }}>
                Register for Another Session
              </button>
            </Link>
          </div>
        )}

        {status === 'pending' && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--warning, #f0ad4e)',
                fontWeight: 600,
                fontSize: '1.05rem',
                marginBottom: 12,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 22, height: 22, flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Payment Pending
            </div>
            <p>{message}</p>
            <Link to="/register">
              <button className="primary" style={{ marginTop: 8 }}>
                Return to Registration
              </button>
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--danger, #dc3545)',
                fontWeight: 600,
                fontSize: '1.05rem',
                marginBottom: 12,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: 22, height: 22, flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
              Something Went Wrong
            </div>
            <p>{message}</p>
            <Link to="/register">
              <button className="primary" style={{ marginTop: 8 }}>
                Return to Registration
              </button>
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
