import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext.jsx'
import {
  deleteRegistrationFromSheets,
  getRegistrationsFromSheets,
  getSessionsFromSheets,
  saveSessionToSheets,
} from '../../api/sheets.js'
import { title, normalizeSessionRegIds, getRegistrationRecordId } from '../../utils/helpers.js'

function buildPeopleList(registrations) {
  const map = {}
  ;(registrations || []).forEach((r) => {
    const first = (r.firstName || r['First Name'] || '').trim()
    const last = (r.lastName || r['Last Name'] || '').trim()
    const email = (r.parentEmail || r['Parent Email'] || r.email || '').trim().toLowerCase()
    const badge = (r.badgeId || r['Badge ID'] || '').trim()
    if (!first && !last && !email) return
    const key = `${email}|${first.toLowerCase()}|${last.toLowerCase()}`
    if (!map[key]) map[key] = { first, last, email, badge, regIds: [] }
    if (badge && !map[key].badge) map[key].badge = badge
    const rid = r.id || r['ID'] || r['Registration ID'] || r['registrationId']
    if (rid) map[key].regIds.push(rid)
  })
  return Object.values(map)
}

function getSessionsForPerson(person, sessions, registrations) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = []
  const past = []

  sessions.forEach((s) => {
    const regIds = normalizeSessionRegIds(s)
    let matchingReg = null
    let regIdToRemove = null

    for (const rid of person.regIds) {
      const reg = registrations.find(
        (r) => (r.id || r['ID'] || r['Registration ID'] || r['registrationId']) === rid
      )
      if (!reg) continue
      if (regIds.includes(rid)) { matchingReg = reg; regIdToRemove = rid; break }
      if (person.badge && regIds.includes(person.badge)) { matchingReg = reg; regIdToRemove = person.badge; break }
      if (reg.sessionId === s.id || reg.sessionID === s.id) { matchingReg = reg; regIdToRemove = person.badge || rid; break }
    }

    let attArr = s.att || []
    if (!Array.isArray(attArr)) {
      try { attArr = typeof attArr === 'string' ? JSON.parse(attArr) : [] } catch { attArr = [] }
    }
    const hasAtt = person.badge ? attArr.some((a) => (a.badge || a.badgeId || '') === person.badge) : false
    const hasReg = !!matchingReg

    const sd = new Date(s.dt)
    sd.setHours(0, 0, 0, 0)
    const item = { session: s, matchingReg, regIdToRemove, hasReg, hasAtt }
    if (sd >= today && hasReg) upcoming.push(item)
    if (sd < today && (hasAtt || hasReg)) past.push(item)
  })

  upcoming.sort((a, b) => new Date(a.session.dt) - new Date(b.session.dt))
  past.sort((a, b) => new Date(b.session.dt) - new Date(a.session.dt))
  return { upcoming, past }
}

/**
 * Rendered via portal at document.body so it floats above all containers
 * regardless of overflow:hidden parents. Positions itself under the anchor input
 * using fixed coordinates from getBoundingClientRect.
 */
function DropdownList({ suggestions, anchorRef, dropdownRef, onSelect }) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (anchorRef.current) {
      setRect(anchorRef.current.getBoundingClientRect())
    }
  }, [anchorRef, suggestions])

  if (!rect) return null

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {suggestions.map((p, i) => (
        <div
          key={i}
          onMouseDown={() => onSelect(p)}
          style={{
            padding: '10px 14px',
            cursor: 'pointer',
            borderBottom: i < suggestions.length - 1 ? '1px solid #eee' : 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f2f2f2')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
        >
          <div style={{ fontWeight: 600, color: '#000' }}>{p.first} {p.last}</div>
          <div style={{ fontSize: '0.82rem', marginTop: 2, color: '#555' }}>
            {p.email || 'No email'}
            {p.badge ? ` • Badge: ${p.badge}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MemberLookup() {
  const { showToast } = useApp()

  const [query, setQuery] = useState('')
  const [allPeople, setAllPeople] = useState([])       // full people list loaded once
  const [allSessions, setAllSessions] = useState([])
  const [allRegs, setAllRegs] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  const [suggestions, setSuggestions] = useState([])   // dropdown matches
  const [showDropdown, setShowDropdown] = useState(false)

  const [selected, setSelected] = useState(null)       // chosen person
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])

  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  // Load all data once when the component is first used
  const ensureData = async () => {
    if (dataLoaded || dataLoading) return
    setDataLoading(true)
    try {
      const [sessions, regs] = await Promise.all([
        getSessionsFromSheets(),
        getRegistrationsFromSheets(true),
      ])
      const people = buildPeopleList(regs)
      setAllSessions(sessions || [])
      setAllRegs(regs || [])
      setAllPeople(people)
      setDataLoaded(true)
    } catch (err) {
      console.error('MemberLookup load error', err)
    } finally {
      setDataLoading(false)
    }
  }

  // Filter suggestions whenever the query changes.
  // Skip if a person is already selected — we don't want the dropdown to
  // reopen just because selectPerson() updated the query text.
  useEffect(() => {
    if (selected) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    const q = query.trim().toLowerCase()
    if (!q || !dataLoaded) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    const matches = allPeople.filter((p) => {
      const full = `${p.first} ${p.last}`.toLowerCase()
      return full.includes(q) || p.email.includes(q) || p.badge.toLowerCase().includes(q)
    })
    setSuggestions(matches.slice(0, 12))
    setShowDropdown(matches.length > 0)
  }, [query, allPeople, dataLoaded, selected])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectPerson = (person) => {
    setSelected(person)
    setQuery(`${person.first} ${person.last}`)
    setShowDropdown(false)
    const { upcoming: up, past: pa } = getSessionsForPerson(person, allSessions, allRegs)
    setUpcoming(up)
    setPast(pa)
  }

  const clearSelection = () => {
    setSelected(null)
    setQuery('')
    setSuggestions([])
    setUpcoming([])
    setPast([])
  }

  const removeRegistration = async (item) => {
    if (!item.hasReg) { alert('No registration to delete'); return }
    if (!confirm('Remove this registration? This will delete it and remove it from the session.')) return
    const registrationId = item.matchingReg ? getRegistrationRecordId(item.matchingReg) : ''
    if (!registrationId) { alert('Registration ID not found'); return }
    try {
      await deleteRegistrationFromSheets(registrationId)
      const s = item.session
      const regIds = normalizeSessionRegIds(s)
      const badgeId = item.matchingReg && (item.matchingReg.badgeId || item.matchingReg['Badge ID'] || '')
      await saveSessionToSheets({
        ...s,
        reg: regIds.filter((id) => id !== item.regIdToRemove && id !== registrationId && id !== badgeId),
      })
      showToast('Registration deleted')
      // Refresh data and re-select the same person
      setDataLoaded(false)
      setDataLoading(true)
      try {
        const [sessions, regs] = await Promise.all([getSessionsFromSheets(), getRegistrationsFromSheets(true)])
        const people = buildPeopleList(regs)
        setAllSessions(sessions || [])
        setAllRegs(regs || [])
        setAllPeople(people)
        setDataLoaded(true)
        const refreshed = people.find(
          (p) => p.email === selected.email && p.first.toLowerCase() === selected.first.toLowerCase() && p.last.toLowerCase() === selected.last.toLowerCase()
        )
        const target = refreshed || selected
        const { upcoming: up, past: pa } = getSessionsForPerson(target, sessions || [], regs || [])
        setUpcoming(up)
        setPast(pa)
      } finally {
        setDataLoading(false)
      }
    } catch (err) {
      alert('Error removing registration: ' + (err.message || 'Unknown error'))
    }
  }

  return (
    <div className="panel">
      <p className="caption muted" style={{ margin: '0 0 12px' }}>
        Search by name, email, or badge ID — then select the person from the list.
      </p>

      {/* Search input with portal dropdown */}
      <div style={{ position: 'relative', maxWidth: 420 }}>
        <input
          ref={inputRef}
          placeholder="Type a name, email, or badge ID…"
          style={{ width: '100%' }}
          value={query}
          onFocus={ensureData}
          onChange={(e) => {
            setQuery(e.target.value)
            if (selected) setSelected(null)
            ensureData()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowDropdown(false)
          }}
        />
        {dataLoading && (
          <span className="caption muted" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            Loading…
          </span>
        )}
      </div>

      {/* Dropdown rendered in a portal so it escapes any overflow:hidden parent */}
      {showDropdown && suggestions.length > 0 && createPortal(
        <DropdownList
          suggestions={suggestions}
          anchorRef={inputRef}
          dropdownRef={dropdownRef}
          onSelect={selectPerson}
        />,
        document.body
      )}

      {/* Selected person card + their sessions */}
      {selected && (
        <div style={{ marginTop: 20 }}>
          {/* Person header */}
          <div
            style={{
              background: 'var(--bg-light)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 20px',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {selected.first} {selected.last}
              </span>
              {selected.email && (
                <span className="caption muted">{selected.email}</span>
              )}
              {selected.badge && (
                <span className="caption muted">Badge: {selected.badge}</span>
              )}
            </div>
            <button
              title="Clear selection"
              onClick={clearSelection}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fca5a5',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fecaca')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fee2e2')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 13, height: 13 }}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Clear
            </button>
          </div>

          {/* Upcoming */}
          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>Upcoming Registrations</h3>
          <div className="list" style={{ marginBottom: 16 }}>
            {upcoming.length === 0 && (
              <div className="muted caption" style={{ padding: '6px 0' }}>No upcoming registrations.</div>
            )}
            {upcoming.map((item, i) => (
              <div key={i} className="item">
                <div>
                  <div>{title(item.session)}</div>
                  <div className="caption muted">
                    Registered
                    {item.matchingReg?.registeredBy ? ' • by ' + item.matchingReg.registeredBy : ''}
                    {item.matchingReg?.paymentStatus === 'paid' ? ' • Paid' : ''}
                    {item.matchingReg?.paymentStatus === 'pending' ? ' • Payment pending' : ''}
                  </div>
                </div>
                <button className="danger" onClick={() => removeRegistration(item)}>
                  Delete
                </button>
              </div>
            ))}
          </div>

          {/* Past */}
          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>Past Sessions</h3>
          <div className="list">
            {past.length === 0 && (
              <div className="muted caption" style={{ padding: '6px 0' }}>No past sessions.</div>
            )}
            {past.map((item, i) => {
              let statusText = ''
              if (item.hasAtt && item.hasReg) statusText = 'Registered • Attended'
              else if (item.hasAtt) statusText = 'Attended'
              else if (item.hasReg) statusText = 'Registered'
              return (
                <div key={i} className="item" style={{ opacity: 0.7 }}>
                  <div>
                    <div>{title(item.session)}</div>
                    <div className="caption muted">
                      {statusText}
                      {item.matchingReg?.registeredBy ? ' • by ' + item.matchingReg.registeredBy : ''}
                      {item.matchingReg?.paymentStatus === 'paid' ? ' • Paid' : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
