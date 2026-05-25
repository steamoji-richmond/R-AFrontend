import { memo } from 'react'

function SessionRowImpl({ session, regStats, branchName = '', isPast, onEdit, onDelete, onView }) {
  const dt = new Date(session.dt)
  const textColor = isPast ? '#999999' : 'var(--text-dark)'
  const opacity = isPast ? 0.6 : 1
  const dateStr = dt.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const confirmedCount = regStats?.confirmed ?? (Array.isArray(session.reg) ? session.reg.length : 0)
  const pendingCount = regStats?.pending ?? 0
  const paidCount = regStats?.paid ?? 0
  const attCount = Array.isArray(session.att) ? session.att.length : 0
  const price = Number(session.price) || 0
  const priceLabel = price > 0 ? `$${price.toFixed(2)}` : 'Free'

  const td = { padding: 12 }
  return (
    <tr style={{ borderBottom: '1px solid var(--border)', opacity }}>
      <td style={{ ...td, color: textColor }}>{dateStr}</td>
      <td style={{ ...td, color: textColor }}>{timeStr}</td>
      <td style={{ ...td, color: textColor }}>{session.topic || 'Public Speaking'}</td>
      <td style={{ ...td, color: textColor }}>
        {branchName || <span className="muted">—</span>}
      </td>
      <td style={{ ...td, textAlign: 'center', color: textColor }}>
        {session.capacity || 10}
      </td>
      <td style={{ ...td, textAlign: 'center', color: textColor }}>{priceLabel}</td>
      <td style={{ ...td, textAlign: 'center', color: textColor }}>
        <div style={{ fontWeight: 600 }}>{confirmedCount}</div>
        {pendingCount > 0 && (
          <div style={{ fontSize: 11, color: '#854d0e', fontWeight: 600, marginTop: 2 }}>
            +{pendingCount} awaiting
          </div>
        )}
        {paidCount > 0 && pendingCount === 0 && confirmedCount > paidCount && (
          <div style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
            {paidCount} paid
          </div>
        )}
      </td>
      <td style={{ ...td, textAlign: 'center', color: textColor }}>{attCount}</td>
      <td style={{ ...td, textAlign: 'center' }}>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <button
            style={{
              padding: '6px 12px',
              fontSize: 13,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
            onClick={() => onView(session)}
          >
            View
          </button>
          <button
            className="primary"
            style={{
              padding: '6px 12px',
              fontSize: 13,
              ...(isPast ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
            }}
            disabled={isPast}
            onClick={() => onEdit(session)}
          >
            Edit
          </button>
          <button
            className="danger"
            style={{
              padding: '6px 12px',
              fontSize: 13,
              ...(isPast ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
            }}
            disabled={isPast}
            onClick={() => onDelete(session)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}

export default memo(SessionRowImpl)
