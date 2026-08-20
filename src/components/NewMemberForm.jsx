import { useEffect, useState } from 'react'
import { getBranches, updateValidationMember } from '../api/sheets.js'

/**
 * Shown on the Register page when a parent email has no matching members yet.
 * Creates a new non-member (membershipType: 'none') and hands it back to the
 * parent so they can proceed to register for a session at full price.
 *
 * The sign-up now requires the user to pick a branch (their home location).
 * That choice goes into PendingMember.branchIds and is carried into the
 * approved Member row on approval, so registrations can later be filtered
 * to just the sessions at their branch (plus any admin-linked branches).
 */
export default function NewMemberForm({ parentEmail, onCreated, onCancel }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [familyRole, setFamilyRole] = useState('Child')
  const [age, setAge] = useState('')
  const [parent, setParent] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [school, setSchool] = useState('')
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState([])
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await getBranches({ signup: true })
        if (cancelled) return
        setBranches(Array.isArray(list) ? list : [])
        // Auto-select if only one active branch exists.
        if (Array.isArray(list) && list.length === 1) setBranchId(list[0].id)
      } finally {
        if (!cancelled) setLoadingBranches(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required')
      return
    }
    if (!parent.trim()) {
      setError("Parent/guardian name is required")
      return
    }
    if (!phoneNumber.trim()) {
      setError('Phone number is required')
      return
    }
    if (branches.length > 0 && !branchId) {
      setError('Please pick a branch (location)')
      return
    }
    setSubmitting(true)
    try {
      const branchIds = branchId ? [branchId] : []
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        familyRole: familyRole.trim() || 'Child',
        age: age.trim(),
        parent: parent.trim(),
        parentEmail: (parentEmail || '').toLowerCase().trim(),
        phoneNumber: phoneNumber.trim(),
        school: school.trim(),
        membershipType: 'none',
        branchIds,
        approvalStatus: 'pending',
      }
      const res = await updateValidationMember(payload)
      const member = {
        ...payload,
        _rowIndex: res._rowIndex || res._id || '',
        _id: res._rowIndex || res._id || '',
        badgeId: '',
        branchIds,
        approvalStatus: res.approvalStatus || 'pending',
      }
      onCreated && onCreated(member)
    } catch (err) {
      console.error('Create member error', err)
      setError(err.message || 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      <div
        className="panel"
        style={{ background: 'var(--bg-light)', border: '1px solid var(--border)' }}
      >
        <h3 style={{ marginTop: 0 }}>Create a non-member account</h3>
        <p className="caption muted" style={{ marginTop: -6 }}>
          No account exists for <strong>{parentEmail}</strong>. Fill this out to
          create a non-member account. An admin will review and approve it
          before you can register for workshops.
        </p>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
          <label>
            First name <span style={{ color: 'var(--danger)' }}>*</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label>
            Last name <span style={{ color: 'var(--danger)' }}>*</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </label>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginTop: 12 }}
        >
          <label>
            Age
            <input
              type="number"
              min="1"
              max="120"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </label>
          <label>
            Family role
            <select
              value={familyRole}
              onChange={(e) => setFamilyRole(e.target.value)}
            >
              <option value="Child">Child</option>
              <option value="Parent">Parent</option>
              <option value="Guardian">Guardian</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginTop: 12 }}
        >
          <label>
            Parent / guardian name{' '}
            <span style={{ color: 'var(--danger)' }}>*</span>
            <input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              required
            />
          </label>
          <label>
            Phone number <span style={{ color: 'var(--danger)' }}>*</span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1-415-555-0123"
              required
            />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>
            Branch (location) <span style={{ color: 'var(--danger)' }}>*</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              required={branches.length > 0}
              disabled={loadingBranches || branches.length === 0}
            >
              <option value="">
                {loadingBranches
                  ? 'Loading branches…'
                  : branches.length === 0
                  ? 'No branches available yet'
                  : '— Select a branch —'}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.city ? ` — ${b.city}` : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="caption muted">
            Pick the location closest to you. An admin may also add you to
            additional branches after approval.
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          <label>
            School (optional)
            <input value={school} onChange={(e) => setSchool(e.target.value)} />
          </label>
        </div>

        {error && (
          <div
            className="caption"
            style={{ color: 'var(--danger)', marginTop: 10 }}
          >
            {error}
          </div>
        )}

        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Submit for admin approval'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
