import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext.jsx'

export function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  return <div className="toast">{toast}</div>
}

export function SuccessModal() {
  const { success, closeSuccess } = useApp()
  if (!success) return null
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && closeSuccess()}>
      <div className="card" style={{ textAlign: 'center', borderColor: 'var(--primary-yellow)' }}>
        <div className="big" style={{ color: 'var(--primary-blue)' }}>✓</div>
        <div
          style={{
            marginTop: 8,
            fontSize: 22,
            fontWeight: 900,
            color: 'var(--primary-blue)',
          }}
        >
          {success}
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
          <button className="primary" onClick={closeSuccess}>OK</button>
        </div>
      </div>
    </div>
  )
}

export function SeatModal() {
  const { seat, closeSeat } = useApp()
  if (seat == null) return null
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && closeSeat()}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="caption">Assigned workstation</div>
        <div className="big">{seat}</div>
        <div className="caption" style={{ marginTop: 2 }}>Please sit at this number.</div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'center' }}>
          <button className="primary" onClick={closeSeat}>OK</button>
        </div>
      </div>
    </div>
  )
}

export default function Overlays() {
  return (
    <>
      <Toast />
      <SuccessModal />
      <SeatModal />
      <PasswordModal />
    </>
  )
}

export function PasswordModal() {
  const { password, resolvePassword } = useApp()
  const inputRef = useRef(null)

  useEffect(() => {
    if (password && inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.focus()
    }
  }, [password])

  if (!password) return null

  const onOk = () => resolvePassword(inputRef.current ? inputRef.current.value : '')
  const onCancel = () => resolvePassword(null)
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onOk()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="modal">
      <div className="card">
        <div style={{ marginBottom: 8 }}>{password.prompt}</div>
        <input
          ref={inputRef}
          type="password"
          autoComplete="one-time-code"
          placeholder="Code"
          onKeyDown={onKey}
        />
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onOk}>OK</button>
        </div>
      </div>
    </div>
  )
}
