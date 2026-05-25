import { useEffect, useState } from 'react'
import AdminModal from '../../components/AdminModal.jsx'
import { getRegistrationsFromSheets } from '../../api/sheets.js'
import { formatMoney } from '../../utils/helpers.js'

const TABS = ['Registrations', 'Attendance']

function paymentBadge(status, amount, currency) {
  const map = {
    paid: { label: 'Paid', bg: '#dcfce7', color: '#15803d', border: '#86efac' },
    pending: { label: 'Awaiting payment', bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
    not_required: { label: 'Free', bg: '#f0f9ff', color: '#0369a1', border: '#7dd3fc' },
  }
  const s = map[status] || { label: status || '—', bg: '#f3f4f6', color: '#374151', border: '#d1d5db' }
  const priceLabel = amount > 0 ? formatMoney(amount, currency || 'CAD') : ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <span style={{
        display: 'inline-block',
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}>
        {s.label}
      </span>
      {priceLabel && (
        <span style={{ fontSize: '0.78rem', color: '#555', fontWeight: 600 }}>{priceLabel}</span>
      )}
    </div>
  )
}

export default function SessionDetailModal({ session, onClose }) {
  const [tab, setTab] = useState('Registrations')
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRegistrationsFromSheets(true)
      .then((all) => {
        const sid = session.id
        const mine = (all || []).filter((r) => {
          const rsid = r.sessionId || r['Session ID'] || ''
          return rsid === sid
        })
        // Show awaiting-payment registrations first, then paid, then free
        mine.sort((a, b) => {
          const order = { pending: 0, paid: 1, not_required: 2 }
          const pa = order[a.paymentStatus] ?? 3
          const pb = order[b.paymentStatus] ?? 3
          return pa - pb
        })
        setRegs(mine)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session])

  // Build attendance lookup from session.att
  const attBadges = new Set(
    (Array.isArray(session.att) ? session.att : []).map((a) =>
      String(a.badge || a.badgeId || '').trim()
    ).filter(Boolean)
  )
  const attRegIds = new Set(
    (Array.isArray(session.att) ? session.att : []).map((a) =>
      String(a.regId || '').trim()
    ).filter(Boolean)
  )

  const didAttend = (r) => {
    const badge = String(r.badgeId || r['Badge ID'] || '').trim()
    const rid = String(r.id || r['ID'] || r['Registration ID'] || r['registrationId'] || '').trim()
    return (badge && attBadges.has(badge)) || (rid && attRegIds.has(rid))
  }

  const attended = regs.filter(didAttend)
  const absent = regs.filter((r) => !didAttend(r))
  const paidCount = regs.filter((r) => r.paymentStatus === 'paid').length
  const pendingCount = regs.filter((r) => r.paymentStatus === 'pending').length
  const freeCount = regs.filter((r) => !r.paymentStatus || r.paymentStatus === 'not_required').length
  const confirmedCount = paidCount + freeCount

  const dt = new Date(session.dt)
  const sessionTitle = `${dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} — ${session.topic || 'Session'}`

  const thS = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.82rem', color: '#555', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }
  const tdS = { padding: '10px 12px', fontSize: '0.88rem', borderBottom: '1px solid #f3f4f6', color: '#111' }

  return (
    <AdminModal onDismiss={onClose}>
      <div className="card" style={{ minWidth: 340, maxWidth: 760, width: '90vw', padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{sessionTitle}</h2>
            <div style={{ fontSize: '0.82rem', color: '#666', marginTop: 4 }}>
              {confirmedCount} confirmed
              {pendingCount > 0 ? ` · ${pendingCount} awaiting payment` : ''}
              {' · '}{attended.length} attended
            </div>
            {(paidCount > 0 || pendingCount > 0 || freeCount > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {paidCount > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: '#dcfce7', color: '#15803d' }}>
                    {paidCount} paid
                  </span>
                )}
                {pendingCount > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: '#fef9c3', color: '#854d0e' }}>
                    {pendingCount} awaiting payment
                  </span>
                )}
                {freeCount > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: '#f0f9ff', color: '#0369a1' }}>
                    {freeCount} free
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: '#888', lineHeight: 1, padding: '0 4px' }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 20px',
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '3px solid #2563eb' : '3px solid transparent',
                marginBottom: -2,
                fontWeight: tab === t ? 700 : 500,
                color: tab === t ? '#2563eb' : '#555',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {t}
              {t === 'Registrations' && <span style={{ marginLeft: 6, background: '#e0e7ff', color: '#3730a3', borderRadius: 999, padding: '1px 7px', fontSize: '0.75rem' }}>{regs.length}</span>}
              {t === 'Attendance' && <span style={{ marginLeft: 6, background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '1px 7px', fontSize: '0.75rem' }}>{attended.length}/{regs.length}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Loading…</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>

            {/* ── Registrations tab ── */}
            {tab === 'Registrations' && (
              regs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>No registrations for this session.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={thS}>#</th>
                      <th style={thS}>Kid's Name</th>
                      <th style={thS}>Parent Email</th>
                      <th style={thS}>Phone</th>
                      <th style={thS}>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regs.map((r, i) => {
                      const first = r.firstName || r['First Name'] || ''
                      const last = r.lastName || r['Last Name'] || ''
                      const email = r.parentEmail || r['Parent Email'] || r.email || '—'
                      const phone = r.phoneNumber || r['Phone Number'] || r.phone || '—'
                      const status = r.paymentStatus || 'not_required'
                      const amount = Number(r.priceAmount || 0)
                      const currency = r.currency || 'CAD'
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ ...tdS, color: '#999', width: 32 }}>{i + 1}</td>
                          <td style={{ ...tdS, fontWeight: 600 }}>{`${first} ${last}`.trim() || '—'}</td>
                          <td style={tdS}>{email}</td>
                          <td style={tdS}>{phone}</td>
                          <td style={tdS}>{paymentBadge(status, amount, currency)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            )}

            {/* ── Attendance tab ── */}
            {tab === 'Attendance' && (
              <div>
                {/* Attended */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#15803d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}><path d="M20 6L9 17l-5-5" /></svg>
                    Attended ({attended.length})
                  </div>
                  {attended.length === 0 ? (
                    <div style={{ color: '#888', fontSize: '0.85rem', paddingLeft: 24 }}>No one has been marked as attended yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f0fdf4' }}>
                        <tr>
                          <th style={thS}>#</th>
                          <th style={thS}>Name</th>
                          <th style={thS}>Parent Email</th>
                          <th style={thS}>Phone</th>
                          <th style={thS}>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attended.map((r, i) => {
                          const first = r.firstName || r['First Name'] || ''
                          const last = r.lastName || r['Last Name'] || ''
                          const status = r.paymentStatus || 'not_required'
                          const amount = Number(r.priceAmount || 0)
                          return (
                            <tr key={i}>
                              <td style={{ ...tdS, color: '#999', width: 32 }}>{i + 1}</td>
                              <td style={{ ...tdS, fontWeight: 600 }}>{`${first} ${last}`.trim() || '—'}</td>
                              <td style={tdS}>{r.parentEmail || r['Parent Email'] || '—'}</td>
                              <td style={tdS}>{r.phoneNumber || r['Phone Number'] || '—'}</td>
                              <td style={tdS}>{paymentBadge(status, amount, r.currency || 'CAD')}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Absent */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#b91c1c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                    Not Attended ({absent.length})
                  </div>
                  {absent.length === 0 ? (
                    <div style={{ color: '#888', fontSize: '0.85rem', paddingLeft: 24 }}>Everyone showed up!</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#fff1f2' }}>
                        <tr>
                          <th style={thS}>#</th>
                          <th style={thS}>Name</th>
                          <th style={thS}>Parent Email</th>
                          <th style={thS}>Phone</th>
                          <th style={thS}>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absent.map((r, i) => {
                          const first = r.firstName || r['First Name'] || ''
                          const last = r.lastName || r['Last Name'] || ''
                          const status = r.paymentStatus || 'not_required'
                          const amount = Number(r.priceAmount || 0)
                          return (
                            <tr key={i}>
                              <td style={{ ...tdS, color: '#999', width: 32 }}>{i + 1}</td>
                              <td style={{ ...tdS, fontWeight: 600 }}>{`${first} ${last}`.trim() || '—'}</td>
                              <td style={tdS}>{r.parentEmail || r['Parent Email'] || '—'}</td>
                              <td style={tdS}>{r.phoneNumber || r['Phone Number'] || '—'}</td>
                              <td style={tdS}>{paymentBadge(status, amount, r.currency || 'CAD')}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  )
}
