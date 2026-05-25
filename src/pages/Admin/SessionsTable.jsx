import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import {
  deleteSessionFromSheets,
  getRegistrationsFromSheets,
  saveSessionToSheets,
} from '../../api/sheets.js'
import AdminModal from '../../components/AdminModal.jsx'
import Pagination from '../../components/Pagination.jsx'
import EditSessionModal from './EditSessionModal.jsx'
import SessionDetailModal from './SessionDetailModal.jsx'
import SessionRow from './SessionRow.jsx'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js'

const PAGE_SIZE = 10

export default function SessionsTable({ sessions, branches = [], onRefresh }) {
  const { showToast } = useApp()
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null) // session pending deletion
  const [registrations, setRegistrations] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all') // all | upcoming | past
  const [branchFilter, setBranchFilter] = useState('all') // 'all' | '' (unassigned) | branch.id
  const debouncedQuery = useDebouncedValue(query, 200)

  useEffect(() => {
    getRegistrationsFromSheets(true)
      .then((rows) => setRegistrations(Array.isArray(rows) ? rows : []))
      .catch(() => setRegistrations([]))
  }, [sessions])

  const regStatsBySession = useMemo(() => {
    const map = {}
    for (const r of registrations) {
      const sid = r.sessionId || r['Session ID'] || ''
      if (!sid) continue
      if (!map[sid]) map[sid] = { confirmed: 0, pending: 0, paid: 0, free: 0 }
      const ps = r.paymentStatus || 'not_required'
      if (ps === 'pending') map[sid].pending++
      else if (ps === 'paid') {
        map[sid].paid++
        map[sid].confirmed++
      } else {
        map[sid].free++
        map[sid].confirmed++
      }
    }
    return map
  }, [registrations])

  const branchById = useMemo(() => {
    const m = {}
    for (const b of branches) m[b.id] = b
    return m
  }, [branches])

  const sorted = useMemo(() => {
    const now = Date.now()
    const arr = (sessions || []).map((s) => ({
      s,
      ts: new Date(s.dt).getTime(),
    }))
    const upcoming = arr.filter((x) => x.ts >= now).sort((a, b) => a.ts - b.ts)
    const past = arr.filter((x) => x.ts < now).sort((a, b) => b.ts - a.ts)
    return upcoming.concat(past).map((x) => x.s)
  }, [sessions])

  const filtered = useMemo(() => {
    const now = Date.now()
    const q = debouncedQuery.trim().toLowerCase()
    let arr = sorted
    if (filter === 'upcoming') arr = arr.filter((s) => new Date(s.dt).getTime() >= now)
    else if (filter === 'past') arr = arr.filter((s) => new Date(s.dt).getTime() < now)
    if (branchFilter !== 'all') {
      arr = arr.filter((s) => (s.branchId || '') === branchFilter)
    }
    if (q) {
      arr = arr.filter((s) => {
        const dt = new Date(s.dt)
        const dateStr = dt
          .toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          .toLowerCase()
        const topic = (s.topic || '').toLowerCase()
        const branchName = (branchById[s.branchId]?.name || '').toLowerCase()
        return (
          topic.includes(q) ||
          dateStr.includes(q) ||
          String(s.id).toLowerCase().includes(q) ||
          branchName.includes(q)
        )
      })
    }
    return arr
  }, [sorted, debouncedQuery, filter, branchFilter, branchById])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, filter, branchFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const p = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE),
    [filtered, p]
  )

  const onDelete = useCallback((s) => setDeleting(s), [])

  const onConfirmDelete = useCallback(
    async (s, reason) => {
      try {
        const response = await deleteSessionFromSheets(s.id, reason)
        let message = (response && response.message) || 'Session deleted'
        if (response && response.deletedRegistrations > 0) {
          message = `Session and ${response.deletedRegistrations} registration(s) deleted`
          if (response.emailedMembers > 0) {
            message += ` — ${response.emailedMembers} member(s) notified by email`
          }
        }
        setDeleting(null)
        showToast(message)
        onRefresh && onRefresh()
      } catch (err) {
        alert('Error deleting session: ' + (err.message || 'Unknown error'))
      }
    },
    [showToast, onRefresh]
  )

  const onEdit = useCallback((s) => setEditing(s), [])
  const onView = useCallback((s) => setViewing(s), [])

  const onSaveEdit = async (updated) => {
    try {
      await saveSessionToSheets(updated)
      showToast('Session updated')
      setEditing(null)
      onRefresh && onRefresh()
    } catch (err) {
      alert('Error saving session: ' + (err.message || 'Unknown error'))
    }
  }

  const now = Date.now()

  return (
    <div className="panel">
      <div className="admin-panel-top">
        <span className="caption muted" style={{ margin: 0 }}>
          Filter and edit workshops. Use the main nav to add new sessions.
        </span>
        <button
          className="primary"
          style={{ padding: '8px 16px', fontSize: 14 }}
          onClick={onRefresh}
        >
          Refresh list
        </button>
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <input
          placeholder="Search by date or topic…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220, flex: 1 }}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All sessions</option>
          <option value="upcoming">Upcoming only</option>
          <option value="past">Past only</option>
        </select>
        {branches.length > 0 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="all">All branches</option>
            <option value="">— Unassigned —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.code ? ` (${b.code})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr
              style={{
                background: 'var(--bg-light)',
                borderBottom: '2px solid var(--border)',
              }}
            >
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Topic</th>
              <th style={thStyle}>Branch</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Capacity</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Price</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Registered</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Attended</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--text-dark)',
                    opacity: 0.7,
                  }}
                >
                  {sessions && sessions.length
                    ? 'No sessions match the current filter.'
                    : 'No sessions yet. Use the forms above to create sessions.'}
                </td>
              </tr>
            )}
            {pageItems.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                regStats={regStatsBySession[s.id]}
                branchName={branchById[s.branchId]?.name || ''}
                isPast={new Date(s.dt).getTime() < now}
                onEdit={onEdit}
                onDelete={onDelete}
                onView={onView}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={p}
        totalPages={totalPages}
        total={filtered.length}
        onPrev={() => setPage((n) => Math.max(1, n - 1))}
        onNext={() => setPage((n) => Math.min(totalPages, n + 1))}
      />
      {editing && (
        <EditSessionModal
          session={editing}
          branches={branches}
          onCancel={() => setEditing(null)}
          onSave={onSaveEdit}
        />
      )}
      {viewing && (
        <SessionDetailModal
          session={viewing}
          onClose={() => setViewing(null)}
        />
      )}
      {deleting && (
        <DeleteSessionModal
          session={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={(reason) => onConfirmDelete(deleting, reason)}
        />
      )}
    </div>
  )
}

const thStyle = {
  padding: 12,
  textAlign: 'left',
  fontWeight: 700,
  color: 'var(--text-dark)',
}

function DeleteSessionModal({ session, onCancel, onConfirm }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const dt = session?.dt ? new Date(session.dt) : null
  const dateStr = dt
    ? dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const timeStr = dt
    ? dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''

  const hasRegistrations = (session?.reg?.length || 0) > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal onDismiss={onCancel}>
      <div className="card admin-dialog-card">
        <h2 style={{ margin: '0 0 4px', color: 'var(--danger)' }}>Delete session?</h2>
        <p className="caption muted" style={{ margin: '0 0 16px' }}>
          {session?.topic || 'Workshop'} &mdash; {dateStr}{timeStr ? ` at ${timeStr}` : ''}
        </p>

        {hasRegistrations && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 14,
              color: '#991B1B',
            }}
          >
            <strong>{session.reg.length} registered member{session.reg.length !== 1 ? 's' : ''}</strong>
            {' '}will be removed and notified by email.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Reason for cancellation
              {hasRegistrations && (
                <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>
              )}
            </span>
            <span
              className="caption muted"
              style={{ display: 'block', marginBottom: 6, marginTop: 2 }}
            >
              {hasRegistrations
                ? 'This will be included in the notification email sent to all registered members.'
                : 'Optional — no members are currently registered.'}
            </span>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={hasRegistrations}
              rows={3}
              placeholder="e.g. Instructor unavailable, venue maintenance…"
              style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>

          <p className="caption muted" style={{ marginBottom: 16 }}>
            This action <strong>cannot be undone</strong>. All registrations for this session
            will be permanently deleted.
          </p>

          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="red" disabled={submitting}>
              {submitting ? 'Deleting…' : 'Delete session'}
            </button>
          </div>
        </form>
      </div>
    </AdminModal>
  )
}
