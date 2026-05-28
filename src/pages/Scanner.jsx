import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { WORKSTATIONS } from '../constants/workstations.js'
import { useApp } from '../context/AppContext.jsx'
import { setAttendKey } from '../utils/authKeys.js'
import {
  getRegistrationsFromSheets,
  getSessionScanData,
  getSessionsFromSheets,
  lookupBadgeById,
  saveSessionToSheets,
  updateAllRegistrationsForUser,
  updateValidationMember,
  verifyAttendPassword,
} from '../api/sheets.js'
import { title } from '../utils/helpers.js'

// ---------------------------------------------------------------------------
// Member picker modal — shown when badge not found, lets admin pick from
// the registered-but-no-badge members of this session.
// ---------------------------------------------------------------------------
function MemberPickerModal({ badge, sessionRegs, sessionMembers, onSelect, onCancel }) {
  const [search, setSearch] = useState('')

  // Only show members who are registered for this session and have no badge
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessionRegs
      .filter((reg) => {
        const rb = (reg.badgeId || reg['Badge ID'] || '').trim()
        return !rb // no badge assigned yet
      })
      .map((reg) => {
        const fn = reg.firstName || reg['First Name'] || ''
        const ln = reg.lastName || reg['Last Name'] || ''
        const em = reg.parentEmail || reg['Parent Email'] || ''
        // Try to find a linked member record
        const member = sessionMembers.find((m) => {
          const mFn = (m.firstName || '').toLowerCase()
          const mLn = (m.lastName || '').toLowerCase()
          const mEm = (m.parentEmail || '').toLowerCase()
          return mFn === fn.toLowerCase() && mLn === ln.toLowerCase() && mEm === em.toLowerCase()
        })
        return { reg, member, fn, ln, em }
      })
      .filter(({ fn, ln, em }) => {
        if (!q) return true
        return (
          `${fn} ${ln}`.toLowerCase().includes(q) ||
          em.toLowerCase().includes(q)
        )
      })
  }, [sessionRegs, sessionMembers, search])

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="card" style={{ maxWidth: 520, width: '95vw' }}>
        <h2 style={{ marginBottom: 4 }}>Who scanned badge {badge}?</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
          Badge not recognised. Pick the person from the session registrants or register as new.
        </p>

        <input
          autoFocus
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />

        <div style={{ maxHeight: '40vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              {search ? 'No matches.' : 'All registered members already have a badge, or none registered.'}
            </div>
          ) : (
            candidates.map(({ reg, fn, ln, em }) => (
              <button
                key={reg.id || `${fn}${ln}${em}`}
                type="button"
                onClick={() => onSelect(reg)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 600 }}>{fn} {ln}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{em}</span>
              </button>
            ))
          )}
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badge registration modal — for truly new members not in the system
// ---------------------------------------------------------------------------
function BadgeRegistrationModal({ badge, onSubmit, onCancel }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [parentEmail, setParentEmail] = useState('')

  const submit = () => {
    const fn = firstName.trim()
    const ln = lastName.trim()
    const pe = parentEmail.trim().toLowerCase()
    if (!fn || !ln || !pe) { alert('Please fill in all required fields'); return }
    if (!pe.includes('@')) { alert('Please enter a valid email address'); return }
    onSubmit({ firstName: fn, lastName: ln, parentEmail: pe })
  }

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="card" style={{ maxWidth: 500 }}>
        <h2>New Member — Register Badge</h2>
        <div className="caption" style={{ marginBottom: 16 }}>Badge ID: {badge}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>First Name *<input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></label>
          <label>Last Name *<input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          <label>Parent Email *
            <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit}>Register</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Scanner component
// ---------------------------------------------------------------------------
export default function Scanner() {
  const { sid } = useParams()
  const navigate = useNavigate()
  const { showToast, showSeat, passwordDialog, attendUnlocked, setAttendUnlocked } = useApp()

  const [session, setSession] = useState(null)
  const [hint, setHint] = useState('') // prominent distance hint
  const [scanning, setScanning] = useState(false)
  const [sessionRegs, setSessionRegs] = useState([])   // registrations for this session
  const [sessionMembers, setSessionMembers] = useState([]) // members (validation data)
  const [loadingRegs, setLoadingRegs] = useState(false)

  // Modal state
  const [pickerData, setPickerData] = useState(null)    // { badge, resolve }
  const [registrationForm, setRegistrationForm] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const pausedRef = useRef(false)
  const ongoingRef = useRef({})
  const detectorRef = useRef(null)

  useEffect(() => {
    if (attendUnlocked) return
    ;(async () => {
      const code = await passwordDialog('Enter attendance password')
      if (code != null && (await verifyAttendPassword(code))) {
        setAttendKey(code)
        setAttendUnlocked(true)
      } else if (code != null) {
        alert('Incorrect password')
        navigate('/attendance')
      } else {
        navigate('/attendance')
      }
    })()
  }, [attendUnlocked, passwordDialog, setAttendUnlocked, navigate])

  // ------------------------------------------------------------------
  // Load session + registrations
  // ------------------------------------------------------------------
  const loadSession = useCallback(async () => {
    const sessions = await getSessionsFromSheets()
    const s = (sessions || []).find((x) => x.id === sid)
    if (!s) { alert('Session not found'); navigate('/attendance'); return }
    setSession(s)
  }, [sid, navigate])

  const loadRegs = useCallback(async () => {
    if (!attendUnlocked) return
    setLoadingRegs(true)
    try {
      const data = await getSessionScanData(sid)
      setSessionRegs(data.registrations || [])
      setSessionMembers(data.members || [])
    } finally {
      setLoadingRegs(false)
    }
  }, [sid, attendUnlocked])

  useEffect(() => { if (attendUnlocked) loadSession() }, [loadSession, attendUnlocked])
  useEffect(() => { if (attendUnlocked) loadRegs() }, [loadRegs, attendUnlocked])

  // ------------------------------------------------------------------
  // Camera
  // ------------------------------------------------------------------
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setScanning(false)
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()) } catch {}
      streamRef.current = null
    }
    setHint('')
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { alert('Camera not available'); return }
    const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const constraints = {
      video: { facingMode: isMobile ? { ideal: 'environment' } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      const v = videoRef.current
      if (!v) return
      v.srcObject = stream
      await new Promise((res) => { if (v.readyState >= 2) res(); else v.onloadedmetadata = () => res() })
      await v.play()
      setScanning(true)
      pausedRef.current = false

      let useNative = false
      if ('BarcodeDetector' in window) {
        try { detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] }); useNative = true } catch {}
      }
      loop(useNative)
    } catch (err) {
      alert('Camera blocked or unavailable. Allow access or use Manual entry.')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loop = useCallback((useNative) => {
    let last = 0
    const interval = 120
    let lastHintTs = 0
    const hintCd = 2000

    const run = async (ts) => {
      if (!streamRef.current) return
      if (pausedRef.current) { rafRef.current = requestAnimationFrame(run); return }
      const v = videoRef.current
      if (!v || v.readyState < 2) { rafRef.current = requestAnimationFrame(run); return }

      if (useNative && detectorRef.current) {
        try {
          const codes = await detectorRef.current.detect(v)
          if (codes?.length) { const raw = String(codes[0].rawValue || '').trim(); if (raw) await handleDetected(raw) }
        } catch {}
        rafRef.current = requestAnimationFrame(run)
        return
      }

      if (ts - last < interval) { rafRef.current = requestAnimationFrame(run); return }
      last = ts

      const vw = v.videoWidth; const vh = v.videoHeight
      if (!vw || !vh) { rafRef.current = requestAnimationFrame(run); return }

      const scale = Math.min(800 / vw, 1)
      const w = Math.max(240, (vw * scale) | 0)
      const h = Math.max(240, (vh * scale) | 0)

      if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
      const canvas = canvasRef.current
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      const g = canvas.getContext('2d', { willReadFrequently: true })
      try {
        g.drawImage(v, 0, 0, w, h)
        const img = g.getImageData(0, 0, w, h)
        const res = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })
        if (res?.data) {
          const raw = String(res.data).trim()
          if (raw) {
            if (res.location) {
              const tl = res.location.topLeftCornerPoint
              const tr = res.location.topRightCornerPoint
              const bl = res.location.bottomLeftCornerPoint
              if (tl && tr && bl) {
                const width = Math.hypot(tr.x - tl.x, tr.y - tl.y)
                const height = Math.hypot(bl.x - tl.x, bl.y - tl.y)
                const rel = (Math.max(width, height) / w) * 100
                const now = Date.now()
                if (rel < 8 && now - lastHintTs > hintCd) {
                  setHint('closer')
                  lastHintTs = now
                  rafRef.current = requestAnimationFrame(run)
                  return
                } else if (rel > 70 && now - lastHintTs > hintCd) {
                  setHint('farther')
                  lastHintTs = now
                  rafRef.current = requestAnimationFrame(run)
                  return
                }
              }
            }
            setHint('ok')
            await handleDetected(raw)
          }
        }
      } catch (e) { console.error('jsQR error', e) }
      rafRef.current = requestAnimationFrame(run)
    }
    rafRef.current = requestAnimationFrame(run)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------
  // handleDetected / checkIn
  // ------------------------------------------------------------------
  const handleDetected = useCallback(async (raw) => {
    if (pausedRef.current) return
    pausedRef.current = true
    try { await checkIn(raw) } finally {
      setTimeout(() => { pausedRef.current = false; setHint('') }, 5000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showMemberPicker = (badge, regs, members) =>
    new Promise((resolve) => setPickerData({ badge, regs, members, resolve }))

  const showBadgeForm = (badge) =>
    new Promise((resolve) => setRegistrationForm({ badge, resolve }))

  const checkIn = async (badge) => {
    if (!badge || typeof badge !== 'string') return
    if (ongoingRef.current[badge]) return
    ongoingRef.current[badge] = true
    const clear = () => { delete ongoingRef.current[badge] }
    setTimeout(clear, 10000)

    const sessions = await getSessionsFromSheets()
    const s = (sessions || []).find((x) => x.id === sid)
    if (!s) { showToast('Session not found'); clear(); return }
    s.att = s.att || []

    const existingAtt = s.att.find((a) => a.badge === badge || a.badgeId === badge)
    if (existingAtt) {
      if (existingAtt.sessionIn && !existingAtt.sessionOut) {
        existingAtt.sessionOut = new Date().toISOString()
        await saveSessionToSheets(s, 'attend')
        showToast(`${badge} checked out`)
        clear(); return
      }
      if (existingAtt.sessionIn && existingAtt.sessionOut) {
        showToast('Already checked out — cannot re-check-in')
        clear(); return
      }
      showToast(`Already checked in — Seat ${existingAtt.seat}`)
      showSeat(existingAtt.seat)
      clear(); return
    }

    const [member, registrations] = await Promise.all([
      lookupBadgeById(badge),
      getRegistrationsFromSheets({ sessionId: sid, auth: 'attend', forceRefresh: true }),
    ])
    let regs = registrations || []

    if (!member) {
      const allSessionRegs = regs.filter((r) => (r.sessionId || r['Session ID'] || '') === sid)
      const picked = await showMemberPicker(badge, allSessionRegs, sessionMembers || [])

      if (picked) {
        // picked is a registration record — link badge to it
        const fn = (picked.firstName || picked['First Name'] || '').trim()
        const ln = (picked.lastName || picked['Last Name'] || '').trim()
        const em = (picked.parentEmail || picked['Parent Email'] || '').toLowerCase().trim()
        member = (sessionMembers || []).find((m) => {
          return (m.firstName || '').toLowerCase() === fn.toLowerCase()
            && (m.lastName || '').toLowerCase() === ln.toLowerCase()
            && (m.parentEmail || '').toLowerCase() === em.toLowerCase()
        }) || { badgeId: badge, firstName: fn, lastName: ln, parentEmail: em }
        member.badgeId = badge
        try {
          await updateValidationMember(member, 'attend')
          const res = await updateAllRegistrationsForUser({ firstName: fn, lastName: ln, parentEmail: em, badgeId: badge })
          if (res.success && res.updatedCount > 0) {
            regs = await getRegistrationsFromSheets({ sessionId: sid, auth: 'attend', forceRefresh: true })
          }
        } catch {}
      } else {
        showToast('Check-in cancelled'); clear(); return
      }
    } else {
      const memberBadgeId = member.badgeId || member['Badge ID'] || ''
      if (!memberBadgeId || memberBadgeId !== badge) {
        member.badgeId = badge
        try {
          await updateValidationMember(member, 'attend')
          const res = await updateAllRegistrationsForUser({
            firstName: member.firstName || member['First Name'] || '',
            lastName: member.lastName || member['Last Name'] || '',
            parentEmail: member.parentEmail || member['Parent Email'] || '',
            badgeId: badge,
          })
          if (res.success && res.updatedCount > 0) {
            regs = await getRegistrationsFromSheets({ sessionId: sid, auth: 'attend', forceRefresh: true })
          }
        } catch {}
      }
    }

    await doCheckIn(s, badge, member, regs, clear)
    loadRegs() // refresh the registered members list
  }

  // Shared seat assignment + save — used by both QR scan and manual check-in
  const doCheckIn = async (s, badge, member, regs, clear) => {
    let registration = regs.find((r) => {
      const rb = r.badgeId || r['Badge ID'] || ''
      const rsid = r.sessionId || r['Session ID'] || ''
      return rb === badge && rsid === sid
    })

    if (!registration && member) {
      const mFn = (member.firstName || member['First Name'] || '').toLowerCase().trim()
      const mLn = (member.lastName || member['Last Name'] || '').toLowerCase().trim()
      const mEm = (member.parentEmail || member['Parent Email'] || '').toLowerCase().trim()
      registration = regs.find((r) => {
        const rsid = r.sessionId || r['Session ID'] || ''
        const rFn = (r.firstName || r['First Name'] || '').toLowerCase().trim()
        const rLn = (r.lastName || r['Last Name'] || '').toLowerCase().trim()
        const rEm = (r.parentEmail || r['Parent Email'] || '').toLowerCase().trim()
        return rsid === sid && rFn === mFn && rLn === mLn && rEm === mEm
      })
    }

    if (!registration) {
      const memberName = member
        ? `${member.firstName || member['First Name'] || ''} ${member.lastName || member['Last Name'] || ''}`.trim()
        : badge
      showToast(`${memberName} is not registered for this session`)
      clear?.()
      return
    }

    const used = {}
    for (const a of s.att) if (a.seat) used[a.seat] = true
    let seat = null
    for (const n of WORKSTATIONS) { if (!used[n]) { seat = n; break } }
    if (seat == null) { showToast('No more seats available'); clear?.(); return }

    const checkInData = {
      badge, badgeId: badge,
      registrationId: registration?.id || registration?.['ID'] || '',
      seat, sessionIn: new Date().toISOString(), ts: Date.now(),
    }
    s.att.push(checkInData)
    try { await saveSessionToSheets(s, 'attend') } catch {}

    const memberName =
      member
        ? `${member.firstName || member['First Name'] || ''} ${member.lastName || member['Last Name'] || ''}`.trim()
        : badge
    showToast(`${memberName} ✓ Seat ${seat}`)
    showSeat(seat)
    clear?.()
  }

  // Manual check-in from the registered members list
  const manualCheckIn = async (reg) => {
    const sessions = await getSessionsFromSheets()
    const s = (sessions || []).find((x) => x.id === sid)
    if (!s) { showToast('Session not found'); return }
    s.att = s.att || []

    const fn = (reg.firstName || reg['First Name'] || '').trim()
    const ln = (reg.lastName || reg['Last Name'] || '').trim()
    const em = (reg.parentEmail || reg['Parent Email'] || '').toLowerCase().trim()
    const rid = reg.id || reg['ID'] || ''
    const badge = reg.badgeId || reg['Badge ID'] || `manual-${rid || fn}-${ln}`

    const existingAtt = s.att.find((a) => a.badge === badge || a.registrationId === rid)
    if (existingAtt) { showToast(`${fn} ${ln} already checked in — Seat ${existingAtt.seat}`); showSeat(existingAtt.seat); return }

    const member = { badgeId: badge, firstName: fn, lastName: ln, parentEmail: em }
    const regs = await getRegistrationsFromSheets({ sessionId: sid, auth: 'attend' })
    await doCheckIn(s, badge, member, regs, null)
    loadRegs()
  }

  const printList = async () => {
    if (!session) return
    const registrations = await getRegistrationsFromSheets({ sessionId: sid, auth: 'attend' })
    const sessionRegsAll = registrations || []
    let rows = sessionRegsAll.map((reg, i) => ({
      i: i + 1,
      badge: reg.badgeId || reg['Badge ID'] || '',
      name: ((reg.firstName || reg['First Name'] || '') + ' ' + (reg.lastName || reg['Last Name'] || '')).trim() || 'Unknown',
    }))
    if (!rows.length && Array.isArray(session.reg)) rows = session.reg.map((b, i) => ({ i: i + 1, badge: b, name: '' }))
    const html =
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Participants</title>` +
      `<style>body{font-family:system-ui,Segoe UI,Roboto;padding:24px}h1{margin:0 0 8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:8px;text-align:left}</style>` +
      `</head><body><h1>Participants</h1><div>${title(session)}</div>` +
      `<table><thead><tr><th>#</th><th>Name</th><th>Badge</th><th>Signature</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${r.i}</td><td>${r.name}</td><td>${r.badge}</td><td></td></tr>`).join('\n') +
      `</tbody></table><script>window.print()<\/script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  // Derive check-in status for each reg
  const attMap = useMemo(() => {
    const m = {}
    if (!session?.att) return m
    for (const a of session.att) {
      if (a.registrationId) m[a.registrationId] = a
      if (a.badge) m[a.badge] = a
    }
    return m
  }, [session])

  const hintStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 15,
    marginBottom: 8,
    ...(hint === 'closer'
      ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
      : hint === 'farther'
      ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }
      : hint === 'ok'
      ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
      : {}),
  }

  if (!attendUnlocked) {
    return (
      <section id="scanPage">
        <div className="panel">
          <p className="caption muted">Attendance access required.</p>
        </div>
      </section>
    )
  }

  return (
    <section id="scanPage">
      {/* Full-width header */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="row wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, flex: 1, minWidth: 200 }}>
            Attendance — <span>{session ? title(session) : '…'}</span>
          </h2>
          <div className="row wrap" style={{ gap: 8, flex: '0 0 auto' }}>
            <button style={{ minWidth: 120 }} onClick={printList}>Print List</button>
            <button style={{ minWidth: 120 }} onClick={() => { stopCamera(); navigate('/attendance') }}>Back</button>
          </div>
        </div>
      </div>

      {/* Two-column layout: camera left, members right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>

        {/* LEFT — camera */}
        <div className="panel">
          <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
            <button className="primary" style={{ flex: 1 }} onClick={startCamera} disabled={scanning}>
              Start Camera
            </button>
            <button className="primary" style={{ flex: 1 }} onClick={stopCamera} disabled={!scanning}>
              Stop
            </button>
          </div>

          {/* Distance/proximity hint */}
          {hint && hint !== 'ok' && (
            <div style={hintStyle}>
              <span style={{ fontSize: 22 }}>{hint === 'closer' ? '🔍' : '↔️'}</span>
              <span>{hint === 'closer' ? 'Move closer to the QR code' : 'Move farther from the QR code'}</span>
            </div>
          )}
          {hint === 'ok' && (
            <div style={hintStyle}>
              <span style={{ fontSize: 22 }}>✅</span>
              <span>QR detected — processing…</span>
            </div>
          )}

          {/* Video — fills container, works on iPad in any orientation */}
          <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>

        {/* RIGHT — registered members */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>
              Registered Members
              {sessionRegs.length > 0 && (
                <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                  {sessionRegs.filter((r) => {
                    const rid = r.id || r['ID'] || ''
                    const rb = r.badgeId || r['Badge ID'] || ''
                    return attMap[rid] || attMap[rb]
                  }).length} / {sessionRegs.length} checked in
                </span>
              )}
            </h3>
            <button style={{ fontSize: 12, padding: '4px 10px' }} onClick={loadRegs} disabled={loadingRegs}>
              {loadingRegs ? '…' : 'Refresh'}
            </button>
          </div>

          {loadingRegs && sessionRegs.length === 0 ? (
            <div className="caption muted">Loading…</div>
          ) : sessionRegs.length === 0 ? (
            <div className="caption muted">No registrations for this session yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '65vh', overflowY: 'auto' }}>
              {sessionRegs.map((reg) => {
                const rid = reg.id || reg['ID'] || ''
                const rb = reg.badgeId || reg['Badge ID'] || ''
                const att = attMap[rid] || attMap[rb]
                const fn = reg.firstName || reg['First Name'] || ''
                const ln = reg.lastName || reg['Last Name'] || ''
                const em = reg.parentEmail || reg['Parent Email'] || ''
                const checkedIn = !!att?.sessionIn
                const seat = att?.seat || ''
                const time = att?.sessionIn ? new Date(att.sessionIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

                return (
                  <div
                    key={rid || `${fn}${ln}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1px solid ${checkedIn ? '#bbf7d0' : '#e5e7eb'}`,
                      background: checkedIn ? '#f0fdf4' : '#fff',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{fn} {ln}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{em}</div>
                      {checkedIn && (
                        <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>✓ Seat {seat} · {time}</div>
                      )}
                    </div>
                    {!checkedIn ? (
                      <button
                        type="button"
                        className="primary"
                        style={{ fontSize: 13, padding: '6px 14px', whiteSpace: 'nowrap' }}
                        onClick={() => manualCheckIn(reg)}
                      >
                        Mark attended
                      </button>
                    ) : (
                      <span style={{ fontSize: 18 }}>✅</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Member picker modal */}
      {pickerData && (
        <MemberPickerModal
          badge={pickerData.badge}
          sessionRegs={pickerData.regs}
          sessionMembers={pickerData.members}
          onSelect={(reg) => {
            const { resolve } = pickerData
            setPickerData(null)
            resolve(reg)
          }}
          onCancel={() => {
            const { resolve } = pickerData
            setPickerData(null)
            resolve(null)
          }}
        />
      )}

      {/* New member registration modal */}
      {registrationForm && (
        <BadgeRegistrationModal
          badge={registrationForm.badge}
          onSubmit={(data) => {
            const { resolve } = registrationForm
            setRegistrationForm(null)
            resolve(data)
          }}
          onCancel={() => {
            const { resolve } = registrationForm
            setRegistrationForm(null)
            resolve(null)
          }}
        />
      )}
    </section>
  )
}
