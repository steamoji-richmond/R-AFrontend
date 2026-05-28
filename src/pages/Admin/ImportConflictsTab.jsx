import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import {
  dismissImportConflict,
  getBranches,
  getImportConflicts,
  resolveImportConflict,
} from '../../api/sheets.js'

const MEMBERSHIP_OPTIONS = ['none', 'yearly', 'paid', 'half']

function ConflictCard({ conflict, branches, branchMap, onResolved, onDismissed }) {
  const conflictBranchNames = (conflict.branchIds || [])
    .map((id) => branchMap[id] || id)
    .filter(Boolean)
  const [form, setForm] = useState({
    firstName: conflict.firstName || '',
    lastName: conflict.lastName || '',
    parentEmail: conflict.parentEmail || '',
    parent: conflict.parent || '',
    phoneNumber: conflict.phoneNumber || '',
    age: conflict.age || '',
    house: conflict.house || '',
    level: conflict.level || '',
    school: conflict.school || '',
    familyRole: conflict.familyRole || '',
    membershipType: conflict.membershipType || 'none',
    branchIds: conflict.branchIds || [],
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(false)

  const missing = !form.firstName || !form.lastName || !form.parentEmail

  const save = async () => {
    if (missing) { setErr('Name and parent email are required.'); return }
    setSaving(true)
    setErr('')
    try {
      await resolveImportConflict(conflict._id, form)
      onResolved(conflict._id)
    } catch (e) {
      setErr(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const dismiss = async () => {
    if (!confirm("Dismiss this conflict? It won't appear again.")) return
    setSaving(true)
    try {
      await dismissImportConflict(conflict._id)
      onDismissed(conflict._id)
    } catch (e) {
      alert(e.message || 'Failed to dismiss')
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, opts = {}) => {
    const isEmpty = !form[key]
    const isRequired = opts.required
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: isRequired && isEmpty ? '#dc2626' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}{isRequired && <span style={{ color: '#dc2626' }}> *</span>}
        </label>
        {opts.select ? (
          <select
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${isRequired && isEmpty ? '#fca5a5' : '#d1d5db'}` }}
          >
            {opts.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={opts.placeholder || ''}
            style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: `1px solid ${isRequired && isEmpty ? '#fca5a5' : '#d1d5db'}`, background: isRequired && isEmpty ? '#fef2f2' : '#fff' }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            {conflict.firstName || conflict.lastName
              ? `${conflict.firstName} ${conflict.lastName}`.trim()
              : <em style={{ color: '#9ca3af' }}>Unknown name</em>}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
            {conflict.reason}
          </span>
          {conflict.membershipType && conflict.membershipType !== 'none' && (
            <span style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 8px' }}>
              {conflict.membershipType}
            </span>
          )}
          {conflictBranchNames.map((name) => (
            <span key={name} style={{ fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 999, padding: '2px 8px' }}>
              {name}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ fontSize: 12, padding: '4px 10px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}
        >
          {expanded ? 'Collapse' : 'Edit & Save'}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('First Name', 'firstName', { required: true })}
            {field('Last Name', 'lastName', { required: true })}
          </div>
          {field('Parent Email', 'parentEmail', { required: true, placeholder: 'parent@example.com' })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('Parent Name', 'parent')}
            {field('Phone', 'phoneNumber')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {field('Age', 'age')}
            {field('Family Role', 'familyRole')}
            {field('Membership', 'membershipType', { select: true, options: MEMBERSHIP_OPTIONS })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('School', 'school')}
            {field('House / Team', 'house')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branches</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {branches.map((b) => {
                const checked = form.branchIds.includes(b.id)
                return (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', padding: '4px 10px', borderRadius: 6, border: `1px solid ${checked ? '#6366f1' : '#d1d5db'}`, background: checked ? '#eef2ff' : '#fff' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        branchIds: e.target.checked
                          ? [...f.branchIds, b.id]
                          : f.branchIds.filter((x) => x !== b.id),
                      }))}
                      style={{ accentColor: '#6366f1' }}
                    />
                    {b.name}
                  </label>
                )
              })}
            </div>
          </div>

          {err && (
            <div style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px' }}>
              {err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={dismiss} disabled={saving} style={{ fontSize: 13, padding: '7px 14px' }}>
              Dismiss
            </button>
            <button type="button" className="primary" onClick={save} disabled={saving || missing}>
              {saving ? 'Saving…' : 'Save as Member'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ImportConflictsTab({ branches: propBranches, onResolved }) {
  const { showToast } = useApp()
  const [conflicts, setConflicts] = useState([])
  const [branches, setBranches] = useState(propBranches || [])
  const [loading, setLoading] = useState(true)
  const [branchFilter, setBranchFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, branchList] = await Promise.all([
        getImportConflicts(),
        propBranches?.length ? Promise.resolve(propBranches) : getBranches({ admin: true }),
      ])
      setConflicts(Array.isArray(list) ? list : [])
      setBranches(Array.isArray(branchList) ? branchList : [])
    } finally {
      setLoading(false)
    }
  }, [propBranches])

  useEffect(() => { load() }, [load])

  const branchMap = useMemo(() => {
    const m = {}
    for (const b of branches) m[b.id] = b.name
    return m
  }, [branches])

  // Only show branches that appear in at least one conflict
  const activeBranches = useMemo(() => {
    const ids = new Set(conflicts.flatMap((c) => c.branchIds || []))
    return branches.filter((b) => ids.has(b.id))
  }, [conflicts, branches])

  const filtered = useMemo(() => {
    if (branchFilter === 'all') return conflicts
    return conflicts.filter((c) => (c.branchIds || []).includes(branchFilter))
  }, [conflicts, branchFilter])

  const handleResolved = (id) => {
    showToast('Saved as member')
    setConflicts((prev) => prev.filter((c) => c._id !== id))
    onResolved && onResolved()
  }

  const handleDismissed = (id) => {
    setConflicts((prev) => prev.filter((c) => c._id !== id))
  }

  return (
    <>
      <div className="admin-panel-top">
        <p className="admin-inline-stat" style={{ margin: 0 }}>
          <span className="caption muted" style={{ fontWeight: 600 }}>
            {loading ? '…' : filtered.length}{branchFilter !== 'all' ? ` / ${conflicts.length}` : ''} conflict{filtered.length !== 1 ? 's' : ''} pending
          </span>
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {activeBranches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px' }}
            >
              <option value="all">All branches ({conflicts.length})</option>
              {activeBranches.map((b) => {
                const count = conflicts.filter((c) => (c.branchIds || []).includes(b.id)).length
                return (
                  <option key={b.id} value={b.id}>{b.name} ({count})</option>
                )
              })}
            </select>
          )}
          <button style={{ padding: '8px 14px', fontSize: 14 }} onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="caption muted" style={{ marginTop: 16 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ marginTop: 24, padding: 32, textAlign: 'center', border: '2px dashed var(--border)', borderRadius: 12, color: 'var(--text-dark)', opacity: 0.7 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {conflicts.length === 0 ? 'No import conflicts' : 'No conflicts for this branch'}
          </div>
          <div className="caption">
            {conflicts.length === 0
              ? 'Members skipped during import (due to missing data) will appear here.'
              : 'Try selecting a different branch filter.'}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            These members were skipped during import because required fields were missing. Fill in the highlighted fields and click <strong>Save as Member</strong>.
          </div>
          {filtered.map((c) => (
            <ConflictCard
              key={c._id}
              conflict={c}
              branches={branches}
              branchMap={branchMap}
              onResolved={handleResolved}
              onDismissed={handleDismissed}
            />
          ))}
        </div>
      )}
    </>
  )
}
