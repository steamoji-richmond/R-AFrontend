import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AdminModal from '../../components/AdminModal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import {
  adminAddRegistrationToSession,
  deleteRegistrationFromSheets,
  getBranches,
  getRegistrationsFromSheets,
  getValidationData,
} from '../../api/sheets.js'
import { formatMoney, getRegistrationRecordId, sessionCapacity } from '../../utils/helpers.js'

const TABS = ['Registrations', 'Attendance']

function memberVisibleBranchIds(memberBranchIds, branchesById) {
  const visible = new Set((memberBranchIds || []).filter(Boolean))
  for (const bid of memberBranchIds || []) {
    const branch = branchesById[bid]
    for (const linked of branch?.linkedBranchIds || []) {
      if (linked) visible.add(String(linked))
    }
  }
  return visible
}

function memberCanAccessSession(member, session, branchesById) {
  if (!session.branchId) return true
  const memberBranches = member.branchIds || []
  if (!memberBranches.length) return false
  return memberVisibleBranchIds(memberBranches, branchesById).has(session.branchId)
}

function AddMemberSearch({ session, regs, branchesById, seatsLeft, onAdded }) {
  const { showToast } = useApp()
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const [addingId, setAddingId] = useState('')
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const registeredMemberIds = useMemo(
    () =>
      new Set(
        (regs || [])
          .map((r) => String(r.memberId || '').trim())
          .filter(Boolean)
      ),
    [regs]
  )

  useEffect(() => {
    getValidationData()
      .then((list) => setMembers(Array.isArray(list) ? list : []))
      .catch(console.error)
      .finally(() => setLoadingMembers(false))
  }, [])

  const eligibleMembers = useMemo(() => {
    return (members || []).filter((m) => {
      if (registeredMemberIds.has(String(m._id))) return false
      return memberCanAccessSession(m, session, branchesById)
    })
  }, [members, registeredMemberIds, session, branchesById])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return eligibleMembers
      .filter((m) => {
        const name = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase()
        const email = (m.parentEmail || '').toLowerCase()
        const badge = (m.badgeId || '').toLowerCase()
        return name.includes(q) || email.includes(q) || badge.includes(q)
      })
      .slice(0, 12)
  }, [query, eligibleMembers])

  useEffect(() => {
    const onDocClick = (e) => {
      if (
        dropdownRef.current?.contains(e.target) ||
        inputRef.current?.contains(e.target)
      ) {
        return
      }
      setShowDropdown(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const addMember = async (member) => {
    if (seatsLeft <= 0) {
      alert('This session is full. Remove a registration or increase capacity first.')
      return
    }
    const name = `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'this member'
    if (
      !confirm(
        `Add ${name} to this workshop? They will be registered immediately and the parent will receive a confirmation email.`
      )
    ) {
      return
    }

    const dt = new Date(session.dt)
    setAddingId(String(member._id))
    try {
      const result = await adminAddRegistrationToSession({
        memberId: member._id,
        badgeId: member.badgeId || '',
        firstName: member.firstName || '',
        lastName: member.lastName || '',
        familyRole: member.familyRole || '',
        age: member.age || '',
        house: member.house || '',
        level: member.level || '',
        school: member.school || '',
        parent: member.parent || '',
        parentEmail: member.parentEmail || '',
        sessionId: session.id,
        sessionDate: dt.toISOString().slice(0, 10),
        sessionTime: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sessionTopic: session.topic || '',
        registeredBy: 'admin',
        registeredDateAndTime: new Date().toISOString(),
      })
      showToast(`${name} added to session`)
      setQuery('')
      setShowDropdown(false)
      onAdded && onAdded(result)
    } catch (err) {
      alert('Could not add member: ' + (err.message || 'Unknown error'))
    } finally {
      setAddingId('')
    }
  }

  if (loadingMembers) {
    return (
      <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: 16 }}>
        Loading members…
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20, padding: '14px 16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>Add member</div>
      {seatsLeft <= 0 ? (
        <div style={{ fontSize: '0.85rem', color: '#b91c1c' }}>
          Session is full — no seats available.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: 10 }}>
            Search approved members linked to this branch. {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left.
          </div>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search by name, email, or badge ID…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            disabled={!!addingId}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
          />
          {showDropdown && query.trim() && suggestions.length === 0 && (
            <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#888' }}>
              No matching members found for this branch.
            </div>
          )}
        </>
      )}

      {showDropdown &&
        suggestions.length > 0 &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: (inputRef.current?.getBoundingClientRect().bottom || 0) + 4,
              left: inputRef.current?.getBoundingClientRect().left || 0,
              width: inputRef.current?.getBoundingClientRect().width || 320,
              zIndex: 10001,
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 8,
              boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {suggestions.map((m) => {
              const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Unnamed'
              const mid = String(m._id)
              return (
                <button
                  key={mid}
                  type="button"
                  disabled={addingId === mid}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addMember(m)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: '1px solid #eee',
                    background: '#fff',
                    cursor: addingId ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{addingId === mid ? 'Adding…' : name}</div>
                  <div style={{ fontSize: '0.82rem', color: '#555', marginTop: 2 }}>
                    {m.parentEmail || 'No email'}
                    {m.badgeId ? ` • Badge: ${m.badgeId}` : ''}
                  </div>
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}

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

export default function SessionDetailModal({ session, onClose, onChanged }) {
  const { showToast } = useApp()
  const [tab, setTab] = useState('Registrations')
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const [branchesById, setBranchesById] = useState({})

  const loadRegistrations = () => {
    setLoading(true)
    return getRegistrationsFromSheets(true)
      .then((all) => {
        const sid = session.id
        const mine = (all || []).filter((r) => {
          const rsid = r.sessionId || r['Session ID'] || ''
          return rsid === sid
        })
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
  }

  useEffect(() => {
    loadRegistrations()
    getBranches({ admin: true })
      .then((list) => {
        const map = {}
        for (const b of list || []) map[b.id] = b
        setBranchesById(map)
      })
      .catch(console.error)
  }, [session])

  const removeRegistration = async (r) => {
    const registrationId = getRegistrationRecordId(r)
    if (!registrationId) {
      alert('Registration ID not found')
      return
    }
    const name = `${r.firstName || r['First Name'] || ''} ${r.lastName || r['Last Name'] || ''}`.trim() || 'this person'
    const status = r.paymentStatus || 'not_required'
    const extra =
      status === 'paid'
        ? ' They have already paid — contact them if a refund is needed.'
        : status === 'pending'
          ? ' Their awaiting-payment spot will be released so they can book another session.'
          : ''
    if (
      !confirm(
        `Remove ${name} from this session? They will be emailed that the registration was cancelled.${extra}`
      )
    ) {
      return
    }
    setDeletingId(registrationId)
    try {
      await deleteRegistrationFromSheets(registrationId)
      setRegs((prev) => prev.filter((row) => getRegistrationRecordId(row) !== registrationId))
      showToast('Removed from session')
      onChanged && onChanged()
    } catch (err) {
      alert('Error removing registration: ' + (err.message || 'Unknown error'))
    } finally {
      setDeletingId('')
    }
  }

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
  const capacity = sessionCapacity(session)
  const seatsLeft = Math.max(0, capacity - confirmedCount)

  const dt = new Date(session.dt)
  const sessionTitle = `${dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} — ${session.topic || 'Session'}`

  const thS = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: '0.82rem', color: '#555', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }
  const tdS = { padding: '10px 12px', fontSize: '0.88rem', borderBottom: '1px solid #f3f4f6', color: '#111' }

  return (
    <AdminModal onDismiss={onClose}>
      <div className="card" style={{ minWidth: 340, maxWidth: 860, width: '90vw', padding: '24px 28px' }}>
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
              <>
                <AddMemberSearch
                  session={session}
                  regs={regs}
                  branchesById={branchesById}
                  seatsLeft={seatsLeft}
                  onAdded={() => {
                    loadRegistrations()
                    onChanged && onChanged()
                  }}
                />
                {regs.length === 0 ? (
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
                      <th style={thS}></th>
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
                      const rid = getRegistrationRecordId(r)
                      return (
                        <tr key={rid || i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ ...tdS, color: '#999', width: 32 }}>{i + 1}</td>
                          <td style={{ ...tdS, fontWeight: 600 }}>{`${first} ${last}`.trim() || '—'}</td>
                          <td style={tdS}>{email}</td>
                          <td style={tdS}>{phone}</td>
                          <td style={tdS}>{paymentBadge(status, amount, currency)}</td>
                          <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="red"
                              style={{ padding: '5px 10px', fontSize: 12 }}
                              disabled={deletingId === rid}
                              onClick={() => removeRegistration(r)}
                            >
                              {deletingId === rid ? 'Removing…' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                )}
              </>
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
