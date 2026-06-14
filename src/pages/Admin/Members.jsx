import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import {
  deleteValidationMember,
  getImportConflicts,
  getValidationData,
  importSteamojiMembers,
  getSteamojiTokenStatus,
  updateValidationMember,
} from '../../api/sheets.js'
import Pagination from '../../components/Pagination.jsx'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js'
import MemberEditModal from './MemberEditModal.jsx'
import ImportConflictsTab from './ImportConflictsTab.jsx'

const PAGE_SIZE = 15

const MEMBERSHIP_LABEL = {
  yearly: 'Yearly',
  'semi-yearly': 'Semi-yearly',
  none: 'Non-member',
}
const MEMBERSHIP_COLOR = {
  yearly: '#1b8a3a',
  'semi-yearly': '#b97d00',
  none: '#6b6b6b',
}

const MemberRow = memo(function MemberRow({ member, branchMap, onEdit, onDelete }) {
  const td = { padding: 12, color: 'var(--text-dark)' }
  const type = member.membershipType || 'none'
  const branchNames = (member.branchIds || [])
    .map((id) => branchMap[id] || id)
    .filter(Boolean)
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td}>
        <div style={{ fontWeight: 600 }}>
          {(member.firstName || '') + ' ' + (member.lastName || '')}
        </div>
        <div className="caption muted">
          {member.familyRole || 'Child'}
          {member.age ? ` • Age ${member.age}` : ''}
        </div>
      </td>
      <td style={td}>
        <div>{member.parentEmail || '—'}</div>
        <div className="caption muted">{member.phoneNumber || ''}</div>
      </td>
      <td style={td}>{member.badgeId || '—'}</td>
      <td style={td}>
        {branchNames.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {branchNames.map((name) => (
              <span
                key={name}
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--bg-light)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-dark)',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ opacity: 0.35 }}>—</span>
        )}
      </td>
      <td style={td}>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: MEMBERSHIP_COLOR[type] + '22',
            color: MEMBERSHIP_COLOR[type],
            border: `1px solid ${MEMBERSHIP_COLOR[type]}44`,
          }}
        >
          {MEMBERSHIP_LABEL[type] || type}
        </span>
        {member.membershipOverride && (
          <span
            title="Membership locked — import will not change this"
            style={{ marginLeft: 5, fontSize: 12, cursor: 'help' }}
          >
            🔒
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: 'center' }}>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <button
            className="primary"
            style={{ padding: '6px 12px', fontSize: 13 }}
            onClick={() => onEdit(member)}
          >
            Edit
          </button>
          <button
            className="danger"
            style={{ padding: '6px 12px', fontSize: 13 }}
            onClick={() => onDelete(member)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
})

// ---------------------------------------------------------------------------
// Steamoji import modal
// ---------------------------------------------------------------------------

const LS_TOKEN_KEY = 'steamoji_auth_token'

function SteamojiImportModal({ branches, branchMap, onClose, onDone }) {
  const [serverStatus, setServerStatus] = useState(null) // null = checking
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(LS_TOKEN_KEY) || '')
  const [selectedBranch, setSelectedBranch] = useState(() => {
    const pre = branches.find((b) => b.organizationId)
    return pre ? pre.id : ''
  })
  const [orgIdOverride, setOrgIdOverride] = useState('')
  const [onlyUpgraded, setOnlyUpgraded] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const tokenRef = useRef(null)

  useEffect(() => {
    if (!selectedBranch && branches.length) {
      const pre = branches.find((b) => b.organizationId)
      if (pre) setSelectedBranch(pre.id)
    }
  }, [branches, selectedBranch])

  useEffect(() => {
    getSteamojiTokenStatus(selectedBranch || undefined).then((s) => setServerStatus(s))
  }, [selectedBranch])

  useEffect(() => {
    if (serverStatus && !serverStatus.tokenConfigured) tokenRef.current?.focus()
  }, [serverStatus])

  const activeBranch = branches.find((b) => b.id === selectedBranch) || null
  const derivedOrgId = activeBranch?.organizationId || ''
  const derivedToken = activeBranch?.steamojiAuthToken || ''
  const derivedCookie = activeBranch?.steamojiAuthCookie || ''
  const effectiveOrgId = derivedOrgId || orgIdOverride.trim()
  const tokenCovered = !!(derivedToken || serverStatus?.tokenConfigured || authToken.trim())
  const cookieCovered = !!(derivedCookie || serverStatus?.cookieConfigured)

  const run = async () => {
    if (!tokenCovered && !authToken.trim()) {
      setError('Paste your Steamoji authorization token.')
      return
    }
    if (!selectedBranch && !effectiveOrgId) {
      setError('Select a branch or enter an Organization ID.')
      return
    }
    if (!effectiveOrgId) {
      setError('Select a branch that has an Organization ID, or enter one manually.')
      return
    }
    if (!cookieCovered) {
      setError('Auth cookie (authoji) is missing. Go to Branches → Edit and set the Steamoji Auth Cookie field.')
      return
    }
    setError('')
    setRunning(true)
    setResult(null)
    try {
      const token = authToken.trim()
      const res = await importSteamojiMembers({
        authToken: token, // empty → backend uses branch / env token
        organizationID: effectiveOrgId,
        branchIds: selectedBranch ? [selectedBranch] : [],
        onlyUpgraded,
      })
      // Persist token in browser so the field is pre-filled next time
      if (token) localStorage.setItem(LS_TOKEN_KEY, token)
      setResult(res)
      onDone()
    } catch (err) {
      setError(err.message || 'Import failed')
    } finally {
      setRunning(false)
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  }
  const modal = {
    background: 'var(--bg-card, #fff)', borderRadius: 12,
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 28,
    width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto',
  }
  const labelStyle = { display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }
  const field = { marginBottom: 16 }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Import from Steamoji</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: 'var(--text-dark)' }}>×</button>
        </div>

        {!result ? (
          <>
            {serverStatus === null ? (
              <div style={{ ...field, color: '#888', fontSize: 13 }}>Checking credentials…</div>
            ) : (tokenCovered && cookieCovered) ? (
              <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#166534' }}>Token &amp; cookie ready</div>
                  <div style={{ fontSize: 12, color: '#166534', opacity: 0.8 }}>Stored on this branch — no need to paste anything</div>
                </div>
              </div>
            ) : tokenCovered && !cookieCovered ? (
              <div style={{ ...field, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#92400e', marginBottom: 3 }}>⚠ Auth cookie missing</div>
                <div style={{ fontSize: 12, color: '#92400e' }}>
                  Token is set but the <code>authoji</code> cookie is missing. Go to <strong>Branches → Edit</strong> and paste the cookie value.
                </div>
              </div>
            ) : (
              <div style={field}>
                <label style={labelStyle}>
                  Authorization Token
                  <span style={{ fontWeight: 400, color: 'var(--text-muted, #888)', marginLeft: 6, fontSize: 12 }}>
                    (DevTools → Network → any /query request → Authorization header)
                  </span>
                </label>
                <textarea
                  ref={tokenRef}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value.replace(/^"|"$/g, '').trim())}
                  placeholder="identoji AgEMc3RlYW1vamkuY29t…"
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                />
                {authToken && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                    Remembered from last import. <button type="button" onClick={() => { setAuthToken(''); localStorage.removeItem(LS_TOKEN_KEY) }} style={{ fontSize: 11, padding: '1px 6px' }}>Clear</button>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Tip: save the token on this branch (Branches → Edit) to never see this field again.
                </div>
              </div>
            )}

            <div style={field}>
              <label style={labelStyle}>Branch</label>
              {branches.length > 0 ? (
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">— select a branch —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name || b.id}{b.organizationId ? ` (org ID set)` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: '#888' }}>No branches configured yet.</div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginTop: 4 }}>
                Members are assigned to this branch. The Organization ID is read from the branch automatically.
              </div>
            </div>

            <div style={field}>
              <label style={labelStyle}>
                Organization ID
              </label>
              {derivedOrgId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 12, background: 'var(--bg-light, #f5f5f5)', padding: '6px 10px', borderRadius: 6, flex: 1, wordBreak: 'break-all', border: '1px solid var(--border)' }}>
                    {derivedOrgId}
                  </code>
                  <span style={{ fontSize: 12, color: '#1b8a3a', whiteSpace: 'nowrap' }}>from branch</span>
                </div>
              ) : (
                <input
                  value={orgIdOverride}
                  onChange={(e) => setOrgIdOverride(e.target.value)}
                  placeholder="e.g. 9bccf74d-2a20-11eb-9946-0242ac110002"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              )}
            </div>

            <div style={{ ...field, marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={onlyUpgraded}
                  onChange={(e) => setOnlyUpgraded(e.target.checked)}
                />
                <span>Only import upgraded (paid) members</span>
              </label>
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee', borderRadius: 6, color: '#c00', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={running}>Cancel</button>
              <button className="primary" onClick={run} disabled={running} style={{ minWidth: 120 }}>
                {running ? 'Importing…' : 'Start Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Import complete</div>
              <div style={{ color: 'var(--text-muted, #666)', fontSize: 13 }}>
                {result.total} member{result.total !== 1 ? 's' : ''} fetched from Steamoji
              </div>
              {result.assignedBranchIds?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#1b8a3a' }}>
                  Assigned to: {result.assignedBranchIds.map((id) => branchMap[id] || id).join(', ')}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'New', value: result.imported, color: '#1b8a3a' },
                { label: 'Updated', value: result.updated, color: '#b97d00' },
                { label: 'Lapsed', value: result.lapsed ?? 0, color: '#c00', title: 'Were active before — membership expired, now pay full price' },
                { label: 'Skipped', value: result.skipped, color: '#6b6b6b', title: 'Missing email or name in Steamoji' },
              ].map(({ label: lbl, value, color, title }) => (
                <div key={lbl} title={title} style={{ textAlign: 'center', padding: '12px 6px', background: color + '11', borderRadius: 8, border: `1px solid ${color}33`, cursor: title ? 'help' : 'default' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 11, color }}>{lbl}</div>
                </div>
              ))}
            </div>

            {result.errors && result.errors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#c00' }}>
                  {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#c00', maxHeight: 120, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Members panel
// ---------------------------------------------------------------------------

export default function Members({ branches = [] }) {
  const { showToast } = useApp()
  // If navigated here from a notification, jump straight to the conflicts tab
  const [activeTab, setActiveTab] = useState(() => {
    if (window.__adminSubTab === 'conflicts') {
      delete window.__adminSubTab
      return 'conflicts'
    }
    return 'members'
  })
  const [conflictCount, setConflictCount] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [membershipFilter, setMembershipFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // null | 'new' | memberObject
  const [showImport, setShowImport] = useState(false)

  // Keep conflict badge count up to date
  const refreshConflictCount = useCallback(() => {
    getImportConflicts().then((l) => setConflictCount(l.length)).catch(() => {})
  }, [])

  useEffect(() => { refreshConflictCount() }, [refreshConflictCount])

  const debouncedQuery = useDebouncedValue(query, 200)

  // id → name lookup used by every row
  const branchMap = useMemo(() => {
    const m = {}
    branches.forEach((b) => { m[b.id] = b.name })
    return m
  }, [branches])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getValidationData()
      setMembers(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Load members error', err)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    let arr = members
    if (membershipFilter !== 'all')
      arr = arr.filter((m) => (m.membershipType || 'none') === membershipFilter)
    if (branchFilter !== 'all')
      arr = arr.filter((m) => Array.isArray(m.branchIds) && m.branchIds.includes(branchFilter))
    if (q) {
      arr = arr.filter((m) => {
        const full = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase()
        return (
          full.includes(q) ||
          (m.parentEmail || '').toLowerCase().includes(q) ||
          (m.phoneNumber || '').toLowerCase().includes(q) ||
          (m.badgeId || '').toLowerCase().includes(q)
        )
      })
    }
    return arr.sort((a, b) =>
      `${a.firstName || ''} ${a.lastName || ''}`.localeCompare(
        `${b.firstName || ''} ${b.lastName || ''}`
      )
    )
  }, [members, debouncedQuery, membershipFilter, branchFilter])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, membershipFilter, branchFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const p = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => filtered.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE),
    [filtered, p]
  )

  const onSave = async (payload) => {
    await updateValidationMember(payload, 'admin')
    showToast(payload._rowIndex ? 'Member updated' : 'Member added')
    setEditing(null)
    load()
  }

  const onDelete = useCallback(
    async (m) => {
      const id = m._rowIndex || m._id
      if (!id) { alert('Member id missing'); return }
      if (
        !confirm(
          `Delete ${m.firstName || ''} ${m.lastName || ''}?\n\nThis cannot be undone. Their past registrations will still exist but will show as an unknown member.`
        )
      )
        return
      try {
        await deleteValidationMember(id)
        showToast('Member deleted')
        load()
      } catch (err) {
        alert('Error deleting: ' + (err.message || 'Unknown error'))
      }
    },
    [load, showToast]
  )

  const counts = useMemo(() => {
    const c = { all: members.length, yearly: 0, 'semi-yearly': 0, none: 0 }
    members.forEach((m) => {
      const t = m.membershipType || 'none'
      if (c[t] != null) c[t]++
    })
    return c
  }, [members])

  return (
    <div className="panel">
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {['members', 'conflicts'].map((id) => {
          const label = id === 'members' ? 'Members' : 'Import Conflicts'
          const badge = id === 'conflicts' && conflictCount ? conflictCount : null
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{
                padding: '7px 16px',
                fontSize: 14,
                fontWeight: active ? 700 : 400,
                borderRadius: 8,
                border: active ? '2px solid var(--primary, #6366f1)' : '2px solid transparent',
                background: active ? 'var(--primary-light, #eef2ff)' : 'transparent',
                color: active ? 'var(--primary, #6366f1)' : 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {label}
              {badge != null && (
                <span style={{ fontSize: 11, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 999, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'conflicts' && (
        <ImportConflictsTab
          branches={branches}
          onResolved={() => { refreshConflictCount(); load() }}
        />
      )}

      {activeTab === 'members' && <>
      <div className="admin-panel-top">
        <span className="caption muted" style={{ margin: 0 }}>
          Member records used for sign-in, pricing, and branches.
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            style={{ padding: '8px 14px', fontSize: 14 }}
            onClick={load}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            style={{ padding: '8px 14px', fontSize: 14 }}
            onClick={() => setShowImport(true)}
          >
            Import from Steamoji…
          </button>
          <button
            className="primary"
            style={{ padding: '8px 14px', fontSize: 14 }}
            onClick={() => setEditing('new')}
          >
            + Add member
          </button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <input
          placeholder="Search name, email, phone, badge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 200, flex: 1 }}
        />
        <select value={membershipFilter} onChange={(e) => setMembershipFilter(e.target.value)}>
          <option value="all">All memberships ({counts.all})</option>
          <option value="yearly">Yearly ({counts.yearly})</option>
          <option value="semi-yearly">Semi-yearly ({counts['semi-yearly']})</option>
          <option value="none">Non-member ({counts.none})</option>
        </select>
        {branches.length > 0 && (
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name || b.id}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ background: 'var(--bg-light)', borderBottom: '2px solid var(--border)' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Contact</th>
              <th style={thStyle}>Badge</th>
              <th style={thStyle}>Branch</th>
              <th style={thStyle}>Membership</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: 24, textAlign: 'center', color: 'var(--text-dark)', opacity: 0.7 }}
                >
                  {members.length
                    ? 'No members match this filter.'
                    : 'No members yet. Click "Add member" to create one.'}
                </td>
              </tr>
            )}
            {pageItems.map((m) => (
              <MemberRow
                key={m._rowIndex || m._id}
                member={m}
                branchMap={branchMap}
                onEdit={setEditing}
                onDelete={onDelete}
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
        <MemberEditModal
          member={editing === 'new' ? null : editing}
          branches={branches}
          onCancel={() => setEditing(null)}
          onSave={onSave}
        />
      )}

      {showImport && (
        <SteamojiImportModal
          branches={branches}
          branchMap={branchMap}
          onClose={() => setShowImport(false)}
          onDone={() => { load(); refreshConflictCount() }}
        />
      )}

      </>}
    </div>
  )
}

const thStyle = {
  padding: 12,
  textAlign: 'left',
  fontWeight: 700,
  color: 'var(--text-dark)',
}
