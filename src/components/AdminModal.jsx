import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders admin dialogs in `document.body` and locks page scroll.
 * Fixes glitches when modals were nested under `.panel`/`.item` with CSS `transform` on hover.
 */
export default function AdminModal({ children, onDismiss, className = '' }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (!onDismiss) return
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && onDismiss) onDismiss()
  }

  return createPortal(
    <div
      className={`modal admin-modal ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      onClick={onDismiss ? handleBackdrop : undefined}
    >
      <div className="modal-inner" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}
