import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import {
  approveMember as approveMemberApi,
  getBranches,
  getPendingMembers,
  rejectMember as rejectMemberApi,
} from '../../api/sheets.js'

export default function Approvals({ onChange }) {
  const { showToast } = useApp()
  const [members, setMembers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, branchList] = await Promise.all([
        getPendingMembers(),
        getBranches({ admin: true }),
      ])
      setMembers(Array.isArray(list) ? list : [])
      setBranches(Array.isArray(branchList) ? branchList : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const branchById = useMemo(() => {
    const m = {}
    for (const b of branches) m[b.id] = b
    return m
  }, [branches])

  const approve = async (m) => {
    const id = m._id || m._rowIndex
    if (!id) return
    setWorkingId(id)
    try {
      await approveMemberApi(id)
      showToast(`${m.firstName || ''} ${m.lastName || ''} approved`)
      setMembers((prev) => prev.filter((x) => (x._id || x._rowIndex) !== id))
      onChange && onChange()
    } catch (err) {
      alert('Error approving: ' + (err.message || 'Unknown error'))
    } finally {
      setWorkingId(null)
    }
  }

  const reject = async (m) => {
    const id = m._id || m._rowIndex
    if (!id) return
    const reason = prompt(
      `Reject ${m.firstName || ''} ${m.lastName || ''}?\n\nOptional reason (shown to the user):`,
      ''
    )
    if (reason === null) return
    setWorkingId(id)
    try {
      await rejectMemberApi(id, reason || '')
      showToast(`${m.firstName || ''} ${m.lastName || ''} rejected`)
      setMembers((prev) => prev.filter((x) => (x._id || x._rowIndex) !== id))
      onChange && onChange()
    } catch (err) {
      alert('Error rejecting: ' + (err.message || 'Unknown error'))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="panel">
      <div className="admin-panel-top">
        <p className="admin-inline-stat" style={{ margin: 0 }} aria-live="polite">
          In queue:{' '}
          <span className="caption muted" style={{ fontWeight: 600 }}>
            {members.length} pending
          </span>
        </p>
        <button
          style={{ padding: '8px 14px', fontSize: 14 }}
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="caption muted" style={{ marginTop: 16 }}>
          Loading…
        </div>
      ) : members.length === 0 ? (
        <div
          style={{
            marginTop: 24,
            padding: 32,
            textAlign: 'center',
            border: '2px dashed var(--border)',
            borderRadius: 12,
            color: 'var(--text-dark)',
            opacity: 0.7,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            No accounts waiting for review
          </div>
          <div className="caption">
            New sign-ups will appear here for approval.
          </div>
        </div>
      ) : (
        <div className="approval-list" style={{ marginTop: 16 }}>
          {members.map((m) => {
            const id = m._id || m._rowIndex
            const busy = workingId === id
            const createdDate = m.createdAt
              ? new Date(m.createdAt).toLocaleString()
              : ''
            return (
              <div key={id} className="approval-card">
                <div className="approval-card-body">
                  <div className="approval-name">
                    {(m.firstName || '') + ' ' + (m.lastName || '')}
                    <span className="approval-role">
                      {m.familyRole || 'Child'}
                      {m.age ? ` • Age ${m.age}` : ''}
                    </span>
                  </div>
                  <div className="approval-meta">
                    <div>
                      <span className="label">Email</span>
                      <span>{m.parentEmail || '—'}</span>
                    </div>
                    <div>
                      <span className="label">Phone</span>
                      <span>{m.phoneNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="label">Parent</span>
                      <span>{m.parent || '—'}</span>
                    </div>
                    <div>
                      <span className="label">School</span>
                      <span>{m.school || '—'}</span>
                    </div>
                    <div>
                      <span className="label">
                        Branch{(m.branchIds || []).length > 1 ? 'es' : ''}
                      </span>
                      <span>
                        {(m.branchIds || [])
                          .map((id) => branchById[id]?.name || id)
                          .join(', ') || '—'}
                      </span>
                    </div>
                    {createdDate && (
                      <div>
                        <span className="label">Submitted</span>
                        <span>{createdDate}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="approval-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => approve(m)}
                  >
                    {busy ? 'Working…' : 'Approve'}
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => reject(m)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
