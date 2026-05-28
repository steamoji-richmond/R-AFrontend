import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import {
  createPaymentCheckout,
  deleteRegistrationFromSheets,
  getBranches,
  getRegistrationsFromSheets,
  getSessionsFromSheets,
  lookupMembersByEmail,
  saveRegistrationToSheets,
} from '../api/sheets.js'
import {
  capLeft,
  clearCapacityCache,
  computeMemberPrice,
  findRegistrationRowForSession,
  formatMoney,
  getRegistrationRecordId,
  kidRegisteredForMonthFromSheets,
  listUpcoming,
  normalizeSessionRegIds,
  sessionCapacity,
  title,
} from '../utils/helpers.js'
import Pagination from '../components/Pagination.jsx'
import NewMemberForm from '../components/NewMemberForm.jsx'

const ELIGIBLE_PER_PAGE = 5
const REGISTERED_PER_PAGE = 10

export default function Register() {
  const { showToast, showSuccess } = useApp()
  const [email, setEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState({ text: '', color: '' })
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [showNewMemberForm, setShowNewMemberForm] = useState(false)
  const [activeTab, setActiveTab] = useState('eligible')

  const [sessions, setSessions] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [branches, setBranches] = useState([])
  const [loadingEligible, setLoadingEligible] = useState(false)
  const [loadingRegistered, setLoadingRegistered] = useState(false)

  const [eligiblePage, setEligiblePage] = useState(1)
  const [registeredPage, setRegisteredPage] = useState(1)
  const [submittingSessionId, setSubmittingSessionId] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [paymentConfirm, setPaymentConfirm] = useState(null) // { session, price }

  const loadSessions = useCallback(async () => {
    const s = await getSessionsFromSheets()
    setSessions(s || [])
    clearCapacityCache()
  }, [])

  const loadRegistrations = useCallback(async (parentEmail, force = true) => {
    const emailKey = (parentEmail || '').trim().toLowerCase()
    if (!emailKey) {
      setRegistrations([])
      return
    }
    const r = await getRegistrationsFromSheets({
      forceRefresh: force,
      email: emailKey,
    })
    setRegistrations(r || [])
    clearCapacityCache()
  }, [])

  const refreshMemberData = useCallback(
    async (parentEmail, force = true) => {
      await Promise.all([
        loadSessions(),
        loadRegistrations(parentEmail, force),
      ])
    },
    [loadSessions, loadRegistrations]
  )

  useEffect(() => {
    loadSessions()
    getBranches({ activeOnly: false }).then((list) => {
      setBranches(Array.isArray(list) ? list : [])
    })
  }, [loadSessions])

  const [searchedEmail, setSearchedEmail] = useState('')

  const searchByEmail = async () => {
    const q = email.trim().toLowerCase()
    if (!q) {
      alert('Please enter an email address')
      return
    }
    setSearchedEmail(q)
    setEmailStatus({ text: 'Looking up members...', color: '' })
    setMembers([])
    setSelectedMember(null)
    setShowNewMemberForm(false)
    try {
      const result = await lookupMembersByEmail(q)
      if (!result || result.length === 0) {
        setEmailStatus({
          text: 'No account found for this email. Create a non-member account below to continue.',
          color: 'var(--primary-blue)',
        })
        setShowNewMemberForm(true)
      } else if (result.length === 1) {
        setSelectedMember(result[0])
        setEmailStatus({ text: 'Member found!', color: 'var(--primary-blue)' })
      } else {
        setMembers(result)
        setEmailStatus({
          text: 'Multiple members found. Please select one.',
          color: 'var(--primary-blue)',
        })
      }
    } catch (err) {
      console.error('Search error:', err)
      setEmailStatus({ text: 'Error searching. Please try again.', color: 'var(--danger)' })
    }
  }

  const onNewMemberCreated = (member) => {
    setShowNewMemberForm(false)
    setSelectedMember(member)
    const pe = (member.parentEmail || searchedEmail || email).trim().toLowerCase()
    if (pe) setSearchedEmail(pe)
    setEmailStatus({
      text:
        'Account submitted. An admin will review and approve it before you can register.',
      color: 'var(--primary-blue)',
    })
  }

  const clearAll = () => {
    setSearchedEmail('')
    setEmail('')
    setEmailStatus({ text: '', color: '' })
    setMembers([])
    setSelectedMember(null)
    setShowNewMemberForm(false)
  }

  // Reload sessions + this member's registrations after search / selection.
  useEffect(() => {
    if (!selectedMember || !searchedEmail) return
    setLoadingEligible(true)
    setLoadingRegistered(true)
    refreshMemberData(searchedEmail, true).finally(() => {
      setLoadingEligible(false)
      setLoadingRegistered(false)
    })
  }, [selectedMember, searchedEmail, refreshMemberData])

  const branchById = useMemo(() => {
    const m = {}
    for (const b of branches) m[b.id] = b
    return m
  }, [branches])

  const visibleBranchIds = useMemo(() => {
    if (!selectedMember) return null
    const raw =
      selectedMember.visibleBranchIds ||
      selectedMember.branchIds ||
      []
    return Array.isArray(raw) && raw.length ? new Set(raw) : null
  }, [selectedMember])

  const sessionsForMember = useMemo(() => {
    if (!visibleBranchIds) return sessions
    return (sessions || []).filter((s) => {
      const bid = s.branchId || ''
      return !bid || visibleBranchIds.has(bid)
    })
  }, [sessions, visibleBranchIds])

  const upcoming = useMemo(
    () => listUpcoming(sessionsForMember),
    [sessionsForMember]
  )

  const eligibleItems = useMemo(() => {
    if (!selectedMember) return []
    const badgeId = selectedMember.badgeId || ''
    const parentEmail = searchedEmail
    const items = []
    for (const s of upcoming) {
      const seatsLeft = capLeft(s)
      const regThisMonth = kidRegisteredForMonthFromSheets(
        selectedMember,
        parentEmail,
        s.dt,
        registrations
      )
      const localReg = badgeId ? (s.reg || []).indexOf(badgeId) > -1 : false
      if (seatsLeft > 0 && !regThisMonth && !localReg) {
        items.push({ session: s, seatsLeft })
      }
    }
    return items
  }, [selectedMember, searchedEmail, upcoming, registrations])

  const registeredItems = useMemo(() => {
    if (!selectedMember) return []
    const badgeId = selectedMember.badgeId || ''
    const parentEmail = searchedEmail
    // Intentionally search across *all* sessions here (not sessionsForMember).
    // If the admin moved a session to a different branch or unlinked
    // branches after a registration was made, we still want the user to be
    // able to see and cancel it rather than have it silently disappear.
    const list = (sessions || []).filter((s) => {
      const regIds = normalizeSessionRegIds(s)
      if (badgeId && regIds.indexOf(badgeId) > -1) return true
      return !!findRegistrationRowForSession(s, selectedMember, parentEmail, registrations)
    })
    list.sort((a, b) => new Date(a.dt) - new Date(b.dt))
    return list
  }, [selectedMember, searchedEmail, sessions, registrations])

  // pagination
  const eligibleTotalPages = Math.max(1, Math.ceil(eligibleItems.length / ELIGIBLE_PER_PAGE))
  const registeredTotalPages = Math.max(1, Math.ceil(registeredItems.length / REGISTERED_PER_PAGE))

  useEffect(() => {
    setEligiblePage(1)
  }, [eligibleItems.length])
  useEffect(() => {
    setRegisteredPage(1)
  }, [registeredItems.length])

  const eligiblePageItems = eligibleItems.slice(
    (eligiblePage - 1) * ELIGIBLE_PER_PAGE,
    eligiblePage * ELIGIBLE_PER_PAGE
  )
  const registeredPageItems = registeredItems.slice(
    (registeredPage - 1) * REGISTERED_PER_PAGE,
    registeredPage * REGISTERED_PER_PAGE
  )

  // For paid sessions, show the no-refund confirmation modal first.
  // Free sessions bypass the modal and register immediately.
  const requestRegisterForSession = (session) => {
    const price = computeMemberPrice(session, selectedMember)
    if (!price.isFree) {
      setPaymentConfirm({ session, price })
      return
    }
    registerForSession(session)
  }

  const registerForSession = async (session) => {
    if (!selectedMember) {
      alert('Please search for your email and select a member to register.')
      return
    }
    const parentEmail = searchedEmail
    if (!parentEmail) {
      alert('Email is required')
      return
    }
    setSubmittingSessionId(session.id)
    try {
      const latestSessions = await getSessionsFromSheets()
      const freshSession =
        latestSessions.find((x) => x.id === session.id) || session
      const seatsLeft = capLeft(freshSession)
      if (seatsLeft <= 0) {
        alert('This session is full. Please select another session.')
        await refreshMemberData(parentEmail, true)
        return
      }
      const latestRegs = await getRegistrationsFromSheets({
        forceRefresh: true,
        email: parentEmail,
      })
      const already = kidRegisteredForMonthFromSheets(
        selectedMember,
        parentEmail,
        session.dt,
        latestRegs
      )
      if (already) {
        alert(
          'This member has already registered for a session this month. Each member can only register once per month.'
        )
        await refreshMemberData(parentEmail, true)
        return
      }

      const registrationData = {
        badgeId: selectedMember.badgeId || '',
        firstName: selectedMember.firstName || '',
        lastName: selectedMember.lastName || '',
        familyRole: selectedMember.familyRole || '',
        age: selectedMember.age || '',
        house: selectedMember.house || '',
        level: selectedMember.level || '',
        school: selectedMember.school || '',
        parent: selectedMember.parent || '',
        parentEmail,
        sessionId: session.id,
        sessionDate: new Date(session.dt).toISOString().slice(0, 10),
        sessionTime: new Date(session.dt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        sessionTopic: session.topic || '',
        registeredBy: parentEmail,
        registeredDateAndTime: new Date().toISOString(),
      }

      const response = await saveRegistrationToSheets(registrationData)
      const registrationId = response.id || registrationData.id

      // If payment is required, redirect to Square checkout instead of
      // showing success immediately. The registration is already saved with
      // paymentStatus='pending'; it becomes confirmed once payment is verified.
      if (!response.isFree && response.paymentStatus === 'pending' && registrationId) {
        try {
          showToast('Redirecting to payment…')
          const checkout = await createPaymentCheckout(registrationId)
          if (checkout.checkoutUrl) {
            window.location.href = checkout.checkoutUrl
            return
          }
          // Checkout created but no URL returned (shouldn't normally happen)
          showToast('Payment link unavailable. Contact support.')
        } catch (err) {
          console.error('Payment checkout error:', err)
          alert(
            'Registration saved but payment link failed: ' +
              (err.message || 'Unknown error') +
              '\nPlease contact support to complete your payment.'
          )
          await refreshMemberData(parentEmail, true)
        }
        return
      }

      // Free or membership-covered — confirm immediately
      showSuccess('Registration Successful!')
      showToast('Registration saved')
      await refreshMemberData(parentEmail, true)
    } catch (err) {
      console.error('Registration error:', err)
      alert('Error saving registration: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmittingSessionId(null)
    }
  }

  const cancelRegistration = async (s) => {
    if (!confirm('Are you sure you want to cancel this registration?')) return
    const parentEmail = searchedEmail
    setCancellingId(s.id)
    try {
      const regsLatest = await getRegistrationsFromSheets({
        forceRefresh: true,
        email: parentEmail,
      })
      const reg = findRegistrationRowForSession(
        s,
        selectedMember,
        parentEmail,
        regsLatest
      )
      const recordId = getRegistrationRecordId(reg)

      if (!recordId) {
        alert('Could not find this registration to cancel. Please try again or contact us.')
        return
      }

      // Backend deleteRegistration removes the doc and pulls from session.reg[] if needed
      await deleteRegistrationFromSheets(recordId)
      showToast('Registration cancelled')
      await refreshMemberData(parentEmail, true)
    } catch (err) {
      console.error('Error cancelling registration:', err)
      alert('Error cancelling registration: ' + (err.message || 'Unknown error'))
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <section id="register">
      <div className="panel">
        <h2>Register for Workshop</h2>

        <div className="row wrap" style={{ marginBottom: 12 }}>
          <label style={{ flex: 1, minWidth: 200, margin: 0 }}>
            Parent Email <span style={{ color: 'var(--danger)' }}>*</span>
            <input
              type="email"
              placeholder="Enter your email address"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  searchByEmail()
                }
              }}
            />
          </label>
          <button
            className="primary"
            style={{ flex: '0 0 auto', marginTop: 24, minWidth: 120 }}
            onClick={searchByEmail}
          >
            Search
          </button>
        </div>

        <div className="caption muted" style={{ marginTop: 8, color: emailStatus.color }}>
          {emailStatus.text}
        </div>

        {showNewMemberForm && !selectedMember && (
          <NewMemberForm
            parentEmail={email.trim().toLowerCase()}
            onCreated={onNewMemberCreated}
            onCancel={() => setShowNewMemberForm(false)}
          />
        )}

        {members.length > 0 && !selectedMember && (
          <div style={{ marginTop: 16 }}>
            <h3>Select Member to Register</h3>
            <div className="list">
              {members.map((m, i) => {
                const branchNames = (m.branchIds || [])
                  .map((id) => branchById[id]?.name || id)
                  .filter(Boolean)
                return (
                  <div key={i} className="item">
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {(m.firstName || '') + ' ' + (m.lastName || '')}
                      </div>
                      <div className="caption muted">
                        Age: {m.age || 'N/A'} • House: {m.house || 'N/A'} • Level:{' '}
                        {m.level || 'N/A'}
                        {branchNames.length
                          ? ` • Branch${branchNames.length > 1 ? 'es' : ''}: ${branchNames.join(', ')}`
                          : ''}
                      </div>
                    </div>
                    <button className="primary" onClick={() => setSelectedMember(m)}>
                      Select
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {selectedMember && (
          <div style={{ marginTop: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              <label>
                First Name
                <input value={selectedMember.firstName || ''} readOnly />
              </label>
              <label>
                Last Name
                <input value={selectedMember.lastName || ''} readOnly />
              </label>
            </div>
            {Array.isArray(selectedMember.branchIds) &&
              selectedMember.branchIds.length > 0 && (
                <div className="caption muted" style={{ marginTop: 8 }}>
                  Branch
                  {selectedMember.branchIds.length > 1 ? 'es' : ''}:{' '}
                  {selectedMember.branchIds
                    .map((id) => branchById[id]?.name || id)
                    .join(', ')}
                </div>
              )}
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginTop: 12 }}
            >
              <label>
                Badge ID
                <input value={selectedMember.badgeId || ''} readOnly />
              </label>
              <label>
                Age
                <input value={selectedMember.age || ''} readOnly />
              </label>
            </div>

            {(selectedMember.approvalStatus || 'approved') === 'pending' && (
              <div className="approval-banner pending">
                <div className="approval-banner-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div>
                  <div className="approval-banner-title">Waiting for admin approval</div>
                  <div className="approval-banner-body">
                    Your account was submitted successfully. An administrator
                    needs to review and approve it before you can register for
                    workshops. You'll be able to register as soon as it's
                    approved — check back later.
                  </div>
                </div>
              </div>
            )}

            {(selectedMember.approvalStatus || 'approved') === 'rejected' && (
              <div className="approval-banner rejected">
                <div className="approval-banner-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                </div>
                <div>
                  <div className="approval-banner-title">Account not approved</div>
                  <div className="approval-banner-body">
                    This account was not approved by an administrator.
                    {selectedMember.rejectedReason
                      ? ` Reason: ${selectedMember.rejectedReason}`
                      : ''}{' '}
                    Please contact an administrator for help.
                  </div>
                </div>
              </div>
            )}

            {(selectedMember.approvalStatus || 'approved') === 'approved' && (
            <div style={{ marginTop: 20 }}>
              <div
                className="row"
                style={{
                  borderBottom: '2px solid var(--border)',
                  marginBottom: 0,
                  background: 'var(--bg-light)',
                  padding: '4px 4px 0 4px',
                  borderRadius: '8px 8px 0 0',
                }}
              >
                <button
                  className={`regTab ${activeTab === 'eligible' ? 'active' : ''}`}
                  onClick={() => setActiveTab('eligible')}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '3px solid transparent',
                    fontWeight: 600,
                    color: 'var(--text-dark)',
                    borderRadius: '6px 6px 0 0',
                  }}
                >
                  Eligible Sessions
                </button>
                <button
                  className={`regTab ${activeTab === 'registered' ? 'active' : ''}`}
                  onClick={() => setActiveTab('registered')}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '3px solid transparent',
                    fontWeight: 600,
                    color: 'var(--text-dark)',
                    borderRadius: '6px 6px 0 0',
                  }}
                >
                  Registered Sessions
                </button>
              </div>

              {activeTab === 'eligible' && (
                <div className="regTabContent">
                  <h3 style={{ marginTop: 0 }}>Eligible Sessions</h3>
                  {loadingEligible ? (
                    <div className="caption muted">Loading sessions...</div>
                  ) : eligibleItems.length === 0 ? (
                    <div className="muted">No eligible sessions available.</div>
                  ) : (
                    <>
                      <div className="list">
                        {eligiblePageItems.map(({ session: s, seatsLeft }) => {
                          const price = computeMemberPrice(s, selectedMember)
                          const priceLabel = price.isFree
                            ? 'Free'
                            : formatMoney(price.amount, price.currency)
                          const btnLabel =
                            submittingSessionId === s.id
                              ? 'Registering...'
                              : price.isFree
                              ? 'Register'
                              : `Register • ${priceLabel}`
                          const branchName = branchById[s.branchId]?.name || ''
                          return (
                            <div key={s.id} className="item">
                              <div>
                                <div>{title(s)}</div>
                                <div className="caption muted">
                                  {branchName ? `${branchName} • ` : ''}
                                  Seats left: {seatsLeft} / {sessionCapacity(s)} •{' '}
                                  Price: {priceLabel}
                                  {price.membershipType === 'yearly' && ' (yearly member)'}
                                  {price.membershipType === 'semi-yearly' &&
                                    ' (50% — semi-yearly)'}
                                </div>
                              </div>
                              <button
                                className="primary"
                                disabled={submittingSessionId === s.id}
                                onClick={() => requestRegisterForSession(s)}
                              >
                                {btnLabel}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <Pagination
                        page={eligiblePage}
                        totalPages={eligibleTotalPages}
                        total={eligibleItems.length}
                        onPrev={() => setEligiblePage((p) => Math.max(1, p - 1))}
                        onNext={() => setEligiblePage((p) => Math.min(eligibleTotalPages, p + 1))}
                      />
                    </>
                  )}
                </div>
              )}

              {activeTab === 'registered' && (
                <div className="regTabContent">
                  <h3 style={{ marginTop: 0 }}>Your Registered Sessions</h3>
                  {loadingRegistered ? (
                    <div className="caption muted">Loading your registered sessions...</div>
                  ) : registeredItems.length === 0 ? (
                    <div className="muted">No registered sessions found.</div>
                  ) : (
                    <>
                      <div className="list">
                        {registeredPageItems.map((s) => {
                          const dt = new Date(s.dt)
                          const now = new Date()
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          const sessionDateOnly = new Date(dt)
                          sessionDateOnly.setHours(0, 0, 0, 0)
                          const isPast = sessionDateOnly < today
                          const hoursUntil = (dt - now) / (1000 * 60 * 60)
                          const within48 = hoursUntil > 0 && hoursUntil <= 48

                          const reg = findRegistrationRowForSession(
                            s,
                            selectedMember,
                            email.trim().toLowerCase(),
                            registrations
                          )
                          const payStatus = reg?.paymentStatus || ''
                          const isPaid = payStatus === 'paid'
                          const awaitingPayment = payStatus === 'pending'

                          const disabled = isPast || within48 || isPaid
                          let status = awaitingPayment ? 'Awaiting payment' : 'Registered'
                          if (isPaid) status = 'Registered • Paid'
                          if (isPast) status += ' (Past)'
                          else if (within48) status += ' (Within 48 hours)'
                          const branchName = branchById[s.branchId]?.name || ''
                          return (
                            <div key={s.id} className="item" style={{ opacity: isPast ? 0.6 : 1 }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{title(s)}</div>
                                <div className="caption muted" style={{ color: awaitingPayment ? 'var(--danger)' : undefined }}>
                                  {branchName ? `${branchName} • ` : ''}
                                  {status}
                                </div>
                              </div>
                              <div className="row" style={{ gap: 6 }}>
                                {awaitingPayment && reg?.id && (
                                  <button
                                    className="primary"
                                    onClick={async () => {
                                      try {
                                        const checkout = await createPaymentCheckout(reg.id)
                                        if (checkout.checkoutUrl) window.location.href = checkout.checkoutUrl
                                      } catch (err) {
                                        alert('Could not load payment link: ' + err.message)
                                      }
                                    }}
                                  >
                                    Pay now
                                  </button>
                                )}
                                <button
                                  className="red"
                                  disabled={disabled || cancellingId === s.id}
                                  title={
                                    isPaid
                                      ? 'Paid registrations cannot be cancelled. Contact an admin for assistance.'
                                      : within48
                                      ? 'Cancellation is not allowed within 48 hours of the session'
                                      : ''
                                  }
                                  onClick={() => cancelRegistration(s)}
                                >
                                  {cancellingId === s.id ? 'Cancelling...' : 'Cancel'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <Pagination
                        page={registeredPage}
                        totalPages={registeredTotalPages}
                        total={registeredItems.length}
                        onPrev={() => setRegisteredPage((p) => Math.max(1, p - 1))}
                        onNext={() =>
                          setRegisteredPage((p) => Math.min(registeredTotalPages, p + 1))
                        }
                      />
                    </>
                  )}
                </div>
              )}
            </div>
            )}

            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="primary" onClick={clearAll}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {paymentConfirm && (
        <PaymentConfirmModal
          session={paymentConfirm.session}
          price={paymentConfirm.price}
          onCancel={() => setPaymentConfirm(null)}
          onConfirm={() => {
            const s = paymentConfirm.session
            setPaymentConfirm(null)
            registerForSession(s)
          }}
        />
      )}
    </section>
  )
}

function PaymentConfirmModal({ session, price, onCancel, onConfirm }) {
  const dt = session?.dt ? new Date(session.dt) : null
  const dateStr = dt
    ? dt.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const timeStr = dt
    ? dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : ''
  const priceLabel = formatMoney(price.amount, price.currency)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: '100%', padding: 28, borderRadius: 12 }}
      >
        <h2 style={{ margin: '0 0 4px', color: '#414042' }}>Confirm Registration</h2>
        <p className="caption muted" style={{ margin: '0 0 20px', color: '#414042', opacity: 0.75 }}>
          {session?.topic || 'Workshop'} &mdash; {dateStr}{timeStr ? ` at ${timeStr}` : ''}
        </p>

        {/* Price summary */}
        <div style={{
          background: '#EFF6FF',
          border: '2px solid #BFDBFE',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontWeight: 600, color: '#414042', fontSize: 15 }}>Amount due</span>
          <span style={{ fontWeight: 800, fontSize: '1.35rem', color: '#0072CE', whiteSpace: 'nowrap' }}>
            {priceLabel}
          </span>
        </div>

        {/* No-refund notice */}
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#991B1B', fontSize: 14 }}>
            No-Refund Policy
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
            All workshop registrations are <strong>non-refundable</strong> and
            <strong> non-transferable</strong> once payment is made. Please ensure you
            can attend before proceeding. If you have questions, contact us before paying.
          </p>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#414042', opacity: 0.85 }}>
          By clicking <strong style={{ color: '#414042' }}>Agree &amp; Pay</strong> you acknowledge that you have read
          and accept this no-refund policy and will be redirected to our secure payment page.
        </p>

        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={onConfirm}>
            Agree &amp; Pay {priceLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
