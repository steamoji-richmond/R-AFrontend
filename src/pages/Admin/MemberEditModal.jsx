import { useState } from 'react'
import AdminModal from '../../components/AdminModal.jsx'

/**
 * Modal for creating or editing a Member. Pass `member={null}` (or omit) to
 * create. Pass an existing member object to edit it.
 */
export default function MemberEditModal({
  member,
  branches = [],
  onCancel,
  onSave,
}) {
  const isEdit = !!(member && (member._id || member._rowIndex))
  const [form, setForm] = useState({
    firstName: member?.firstName || '',
    lastName: member?.lastName || '',
    familyRole: member?.familyRole || 'Child',
    age: member?.age || '',
    house: member?.house || '',
    level: member?.level || '',
    school: member?.school || '',
    parent: member?.parent || '',
    parentEmail: member?.parentEmail || '',
    phoneNumber: member?.phoneNumber || '',
    badgeId: member?.badgeId || '',
    membershipType: member?.membershipType || 'none',
  })
  const [branchIds, setBranchIds] = useState(
    () => new Set(Array.isArray(member?.branchIds) ? member.branchIds : [])
  )
  const [membershipOverride, setMembershipOverride] = useState(
    member?.membershipOverride || false
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const activeBranches = branches.filter(
    (b) => b.active !== false || branchIds.has(b.id)
  )

  const toggleBranch = (id) =>
    setBranchIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required')
      return
    }
    if (!form.parentEmail.trim()) {
      setError('Parent email is required')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        parentEmail: form.parentEmail.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim(),
        badgeId: form.badgeId.trim(),
        branchIds: [...branchIds],
        membershipOverride,
      }
      if (isEdit) {
        payload._rowIndex = member._rowIndex || member._id
      }
      await onSave(payload)
    } catch (err) {
      setError(err.message || 'Failed to save member')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal onDismiss={onCancel} className="member-modal">
      <div className="card member-card">
        <h2 className="member-card-title">
          {isEdit ? 'Edit member' : 'Add member'}
        </h2>
        <form onSubmit={submit}>
          <div className="member-form-grid">
            <label>
              First name <span style={{ color: 'var(--danger)' }}>*</span>
              <input
                name="firstName"
                value={form.firstName}
                onChange={onChange}
                required
              />
            </label>
            <label>
              Last name <span style={{ color: 'var(--danger)' }}>*</span>
              <input
                name="lastName"
                value={form.lastName}
                onChange={onChange}
                required
              />
            </label>
            <label>
              Parent email <span style={{ color: 'var(--danger)' }}>*</span>
              <input
                type="email"
                name="parentEmail"
                value={form.parentEmail}
                onChange={onChange}
                required
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                name="phoneNumber"
                value={form.phoneNumber}
                onChange={onChange}
                placeholder="+1-415-555-0123"
              />
            </label>
            <label>
              Parent / guardian name
              <input name="parent" value={form.parent} onChange={onChange} />
            </label>
            <label>
              Family role
              <select
                name="familyRole"
                value={form.familyRole}
                onChange={onChange}
              >
                <option value="Child">Child</option>
                <option value="Parent">Parent</option>
                <option value="Guardian">Guardian</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label>
              Age
              <input
                type="number"
                min="1"
                max="120"
                name="age"
                value={form.age}
                onChange={onChange}
              />
            </label>
            <label>
              Badge ID
              <input name="badgeId" value={form.badgeId} onChange={onChange} />
            </label>
            <label>
              House
              <input name="house" value={form.house} onChange={onChange} />
            </label>
            <label>
              Level
              <input name="level" value={form.level} onChange={onChange} />
            </label>
            <label className="full-row">
              School
              <input name="school" value={form.school} onChange={onChange} />
            </label>
            {activeBranches.length > 0 && (
              <div className="full-row">
                <label style={{ display: 'block', marginTop: 10, marginBottom: 6 }}>
                  Branches
                </label>
                <div className="admin-branch-pills" role="group" aria-label="Member branches">
                  {activeBranches.map((b) => (
                    <label
                      key={b.id}
                      className={
                        'admin-branch-pill' +
                        (branchIds.has(b.id) ? ' admin-branch-pill--on' : '')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={branchIds.has(b.id)}
                        onChange={() => toggleBranch(b.id)}
                      />
                      <span>
                        {b.name}
                        {b.code ? ` (${b.code})` : ''}
                      </span>
                    </label>
                  ))}
                </div>
                <span className="caption muted" style={{ marginTop: 4, display: 'block' }}>
                  Pick every branch this member is allowed to register at.
                  Linked branches carry over automatically.
                </span>
              </div>
            )}
            <div className="full-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: '0.9em' }}>Membership</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={membershipOverride}
                    onChange={(e) => setMembershipOverride(e.target.checked)}
                  />
                  Lock (prevent import from changing this)
                </label>
              </div>
              <select
                name="membershipType"
                value={form.membershipType}
                onChange={(e) => { onChange(e); setMembershipOverride(true) }}
              >
                <option value="none">Non-Steamoji (full price)</option>
                <option value="semi-yearly">Non-annual (40% off)</option>
                <option value="yearly">Annual (free)</option>
              </select>
              {membershipOverride && (
                <div style={{ marginTop: 5, fontSize: 12, color: '#b97d00', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>⚠ Locked — Steamoji import will not change this membership</span>
                  <button
                    type="button"
                    onClick={() => setMembershipOverride(false)}
                    style={{ fontSize: 11, padding: '1px 7px', marginLeft: 4 }}
                  >
                    Unlock
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div
              className="caption"
              style={{ color: 'var(--danger)', marginTop: 10 }}
            >
              {error}
            </div>
          )}

          <div
            className="row"
            style={{ marginTop: 16, gap: 8, justifyContent: 'flex-end' }}
          >
            <button type="button" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create member'}
            </button>
          </div>
        </form>
      </div>
    </AdminModal>
  )
}
