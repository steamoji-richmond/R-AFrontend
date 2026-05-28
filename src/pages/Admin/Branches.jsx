import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminModal from '../../components/AdminModal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import {
  deleteBranch,
  getBranches,
  saveBranch,
  setBranchActive,
  updateBranchLinks,
} from '../../api/sheets.js'

/**
 * Admin → Branches
 *
 * Create / edit / deactivate branches, and link two or more branches
 * together. When branches A and B are linked, members of A can register
 * for workshops at B (and vice versa). The linkage is stored symmetrically
 * on the server, so updating one side automatically updates the other.
 */
export default function Branches({ onChange }) {
  const { showToast } = useApp()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null) // branch being edited, or null
  const [creating, setCreating] = useState(false)
  const [linkPanel, setLinkPanel] = useState(null) // branch whose links are being edited

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getBranches({ admin: true })
      setBranches(Array.isArray(list) ? list : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const byId = useMemo(() => {
    const map = {}
    for (const b of branches) map[b.id] = b
    return map
  }, [branches])

  const onSave = async (payload) => {
    try {
      await saveBranch(payload)
      showToast(payload.id ? 'Branch updated' : 'Branch created')
      setCreating(false)
      setEditing(null)
      await refresh()
      onChange && onChange()
    } catch (err) {
      alert(err.message || 'Failed to save branch')
    }
  }

  const onDelete = async (branch) => {
    if (
      !confirm(
        `Delete "${branch.name}"? This cannot be undone. Sessions and members still attached to it will block the delete.`
      )
    )
      return
    try {
      await deleteBranch(branch.id)
      showToast('Branch deleted')
      await refresh()
      onChange && onChange()
    } catch (err) {
      alert(err.message || 'Failed to delete branch')
    }
  }

  const onToggleActive = async (branch) => {
    try {
      await setBranchActive(branch.id, !branch.active)
      showToast(branch.active ? 'Branch deactivated' : 'Branch activated')
      await refresh()
    } catch (err) {
      alert(err.message || 'Failed to update branch')
    }
  }

  return (
    <div className="panel">
      <div className="admin-panel-top">
        <span className="caption muted" style={{ margin: 0 }}>
          Each location has its own workshops. Link branches so members can use
          each other&rsquo;s sessions.
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button onClick={refresh}>Refresh</button>
          <button className="primary" onClick={() => setCreating(true)}>
            Add branch
          </button>
        </div>
      </div>

      {loading ? (
        <div className="caption muted" style={{ marginTop: 12 }}>
          Loading…
        </div>
      ) : branches.length === 0 ? (
        <div className="muted" style={{ marginTop: 12 }}>
          No branches yet. Click &ldquo;Add branch&rdquo; to create your first
          location.
        </div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {branches.map((b) => {
            const linkedNames = (b.linkedBranchIds || [])
              .map((id) => byId[id]?.name || id)
              .filter(Boolean)
            return (
              <div key={b.id} className="item" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {b.name}
                    {b.code ? (
                      <span className="caption muted" style={{ marginLeft: 8 }}>
                        ({b.code})
                      </span>
                    ) : null}
                    {!b.active && (
                      <span
                        className="caption"
                        style={{
                          marginLeft: 8,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--bg-light)',
                          color: 'var(--text-dark)',
                        }}
                      >
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="caption muted">
                    {[b.city, b.region, b.country].filter(Boolean).join(', ') || '—'}
                    {b.phone ? ` • ${b.phone}` : ''}
                    {b.email ? ` • ${b.email}` : ''}
                  </div>
                  {b.organizationId && (
                    <div className="caption" style={{ marginTop: 3 }}>
                      <span style={{ fontWeight: 600, opacity: 0.6, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Org ID</span>
                      <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: '0.82rem', background: 'var(--bg-light)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>{b.organizationId}</span>
                    </div>
                  )}
                  <div className="caption" style={{ marginTop: 4 }}>
                    Linked:{' '}
                    {linkedNames.length ? (
                      linkedNames.join(', ')
                    ) : (
                      <span className="muted">none</span>
                    )}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setLinkPanel(b)}>Manage links</button>
                  <button onClick={() => setEditing(b)}>Edit</button>
                  <button onClick={() => onToggleActive(b)}>
                    {b.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="red" onClick={() => onDelete(b)}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <BranchModal
          branch={editing}
          onCancel={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={onSave}
        />
      )}

      {linkPanel && (
        <LinkModal
          branch={linkPanel}
          allBranches={branches}
          onCancel={() => setLinkPanel(null)}
          onSaved={async () => {
            setLinkPanel(null)
            await refresh()
            onChange && onChange()
          }}
        />
      )}
    </div>
  )
}

function BranchModal({ branch, onCancel, onSave }) {
  const isEdit = !!branch
  const [form, setForm] = useState({
    name: branch?.name || '',
    code: branch?.code || '',
    organizationId: branch?.organizationId || '',
    steamojiAuthToken: branch?.steamojiAuthToken || '',
    steamojiAuthCookie: branch?.steamojiAuthCookie || '',
    address: branch?.address || '',
    city: branch?.city || '',
    region: branch?.region || '',
    country: branch?.country || '',
    phone: branch?.phone || '',
    email: branch?.email || '',
    gmailAppPass: branch?.gmailAppPass || '',
    squareEnv: branch?.squareEnv || 'sandbox',
    squareAccessToken: branch?.squareAccessToken || '',
    squareLocationId: branch?.squareLocationId || '',
    squareApplicationId: branch?.squareApplicationId || '',
    active: branch?.active !== false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const onChange = (e) => {
    const { name, value, type, checked } = e.target
    // Strip accidental JSON quotes when pasting token/cookie values
    const cleaned = (name === 'steamojiAuthToken' || name === 'steamojiAuthCookie')
      ? value.replace(/^"|"$/g, '').trim()
      : value
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : cleaned }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Branch name is required')
      return
    }
    setSubmitting(true)
    try {
      const payload = { ...form, name: form.name.trim() }
      if (isEdit) payload.id = branch.id
      await onSave(payload)
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal onDismiss={onCancel}>
      <div className="card admin-dialog-card">
        <h2>{isEdit ? 'Edit branch' : 'Add branch'}</h2>
        <form onSubmit={submit}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            <label>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
              <input name="name" value={form.name} onChange={onChange} required />
            </label>
            <label>
              Code (short)
              <input
                name="code"
                value={form.code}
                onChange={onChange}
                placeholder="DT, WST, …"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Organization ID
                <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 999, padding: '1px 7px' }}>
                  Required for member sync
                </span>
              </span>
              <input
                name="organizationId"
                value={form.organizationId}
                onChange={onChange}
                placeholder="e.g. ORG-001 or the ID from your external system"
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, display: 'block' }}>
                Paste the Organisation ID from the other system. Members are matched and assigned to this branch using this value.
              </span>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Steamoji Auth Token
                <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 999, padding: '1px 7px' }}>
                  Per-org token
                </span>
              </span>
              <input
                name="steamojiAuthToken"
                value={form.steamojiAuthToken}
                onChange={onChange}
                placeholder="identoji AgEMc3RlYW1vamkuY29t…"
                style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, display: 'block' }}>
                Paste the <code>Authorization</code> header value from DevTools → Network → any /query request. Lasts ~1 year.
              </span>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Steamoji Auth Cookie
                <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px' }}>
                  Required
                </span>
              </span>
              <input
                name="steamojiAuthCookie"
                value={form.steamojiAuthCookie}
                onChange={onChange}
                placeholder="AgEMc3RlYW1vamkuY29tAhphdXRob2pp…"
                style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, display: 'block' }}>
                DevTools → Network → any /query request → Request Headers → <code>cookie</code> → copy just the <code>authoji=</code> value (everything after <code>authoji=</code> up to the next <code>;</code>). Auto-refreshes after every import.
              </span>
            </label>
            <label className="full-row" style={{ gridColumn: '1 / -1' }}>
              Address
              <input name="address" value={form.address} onChange={onChange} />
            </label>
            <label>
              City
              <input name="city" value={form.city} onChange={onChange} />
            </label>
            <label>
              Region / State
              <input name="region" value={form.region} onChange={onChange} />
            </label>
            <label>
              Country
              <input name="country" value={form.country} onChange={onChange} />
            </label>
            <label>
              Phone
              <input name="phone" value={form.phone} onChange={onChange} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Email
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#6b7280' }}>
                  Used as the sending address for all outgoing emails
                </span>
              </span>
              <input type="email" name="email" value={form.email} onChange={onChange} placeholder="branch@gmail.com" />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Gmail App Password
                <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px' }}>
                  Required to send email
                </span>
              </span>
              <input
                type="password"
                name="gmailAppPass"
                value={form.gmailAppPass}
                onChange={onChange}
                placeholder="16-character app password"
                style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                autoComplete="new-password"
              />
              <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, display: 'block' }}>
                Set a Gmail App Password for the address above. Google Account → Security → 2-Step Verification → App passwords → Create. Emails (registrations, reminders, cancellations) will be sent from this branch&rsquo;s own Gmail account.
              </span>
            </label>

            {/* ── Square payment credentials ── */}
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-dark)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                Square Payment
                <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 999, padding: '1px 7px' }}>
                  Per-branch
                </span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                <label style={{ gridColumn: '1 / -1' }}>
                  Environment
                  <select name="squareEnv" value={form.squareEnv} onChange={onChange}>
                    <option value="sandbox">Sandbox (testing)</option>
                    <option value="production">Production (live)</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Access Token
                  <input
                    type="password"
                    name="squareAccessToken"
                    value={form.squareAccessToken}
                    onChange={onChange}
                    placeholder="EAAAl…"
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    autoComplete="new-password"
                  />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4, display: 'block' }}>
                    Square Developer Dashboard → your app → Credentials → Access Token.
                  </span>
                </label>
                <label>
                  Location ID
                  <input
                    name="squareLocationId"
                    value={form.squareLocationId}
                    onChange={onChange}
                    placeholder="L…"
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                </label>
                <label>
                  Application ID
                  <input
                    name="squareApplicationId"
                    value={form.squareApplicationId}
                    onChange={onChange}
                    placeholder="sq0idp-…"
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                </label>
              </div>
            </div>

            <label
              className="admin-checkbox-row"
              style={{ gridColumn: '1 / -1' }}
            >
              <input
                type="checkbox"
                name="active"
                checked={form.active}
                onChange={onChange}
              />
              <span>Active (show in sign-up + session forms)</span>
            </label>
          </div>
          {error && (
            <div className="caption" style={{ color: 'var(--danger)', marginTop: 10 }}>
              {error}
            </div>
          )}
          <div className="row" style={{ marginTop: 16, gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create branch'}
            </button>
          </div>
        </form>
      </div>
    </AdminModal>
  )
}

function LinkModal({ branch, allBranches, onCancel, onSaved }) {
  const candidates = allBranches.filter((b) => b.id !== branch.id)
  const [selected, setSelected] = useState(
    () => new Set(branch.linkedBranchIds || [])
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setSubmitting(true)
    setError('')
    try {
      await updateBranchLinks(branch.id, [...selected], 'set')
      await onSaved()
    } catch (err) {
      setError(err.message || 'Failed to update links')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal onDismiss={onCancel}>
      <div className="card admin-dialog-card admin-dialog-card--wide">
        <h2 style={{ margin: 0 }}>Link branches</h2>
        <p className="caption muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
          Choose which other branches <strong>{branch.name}</strong> should
          share workshops + members with. Changes are bidirectional — if you
          link branch A to B, branch B is automatically linked to A as well.
        </p>

        {candidates.length === 0 ? (
          <div className="muted" style={{ marginTop: 12 }}>
            No other branches to link to yet. Add another branch first.
          </div>
        ) : (
          <div className="admin-link-list" role="group" aria-label="Branches to link">
            {candidates.map((b) => (
              <label key={b.id} className="admin-link-row">
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggle(b.id)}
                />
                <div className="admin-link-row-body">
                  <div className="admin-link-row-title">
                    {b.name}
                    {b.code ? (
                      <span style={{ fontWeight: 500, opacity: 0.65, marginLeft: 6 }}>
                        ({b.code})
                      </span>
                    ) : null}
                  </div>
                  <div className="admin-link-row-meta">
                    {[b.city, b.region, b.country].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="caption" style={{ color: 'var(--danger)', marginTop: 10 }}>
            {error}
          </div>
        )}

        <div className="row" style={{ marginTop: 16, gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={save}
            disabled={submitting || candidates.length === 0}
          >
            {submitting ? 'Saving…' : 'Save links'}
          </button>
        </div>
      </div>
    </AdminModal>
  )
}
