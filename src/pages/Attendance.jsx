import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getBranches,
  getRegistrationsFromSheets,
  getSessionsFromSheets,
} from '../api/sheets.js'
import { listUpcoming, title, todayFloor } from '../utils/helpers.js'
import Pagination from '../components/Pagination.jsx'

const PAGE_SIZE = 20

const SessionItem = memo(function SessionItem({ session, regCount, attCount, branchNames, onScan }) {
  return (
    <div className="item">
      <div>
        <div>{title(session)}</div>
        <div className="caption muted">
          Reg {regCount}/{session.capacity} • Checked in {attCount}
          {branchNames.length > 0 && (
            <span style={{ marginLeft: 6 }}>
              {branchNames.map((n) => (
                <span
                  key={n}
                  style={{
                    display: 'inline-block',
                    padding: '1px 7px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(99,102,241,0.12)',
                    color: '#4338ca',
                    marginLeft: 4,
                  }}
                >
                  {n}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onScan(session.id)}>Scan</button>
    </div>
  )
})

export default function Attendance() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [branches, setBranches] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedSid, setSelectedSid] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, r, b] = await Promise.all([
        getSessionsFromSheets(),
        getRegistrationsFromSheets(true),
        getBranches(),
      ])
      setSessions(s || [])
      setRegistrations(r || [])
      setBranches(Array.isArray(b) ? b : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const branchMap = useMemo(() => {
    const m = {}
    branches.forEach((b) => { m[b.id] = b.name })
    return m
  }, [branches])

  const up = useMemo(() => listUpcoming(sessions), [sessions])

  // Sessions filtered by selected branch (used in the session dropdown)
  const branchFiltered = useMemo(() => {
    if (!selectedBranch) return up
    return up.filter((s) => {
      const ids = s.branchIds || (s.branchId ? [s.branchId] : [])
      return ids.includes(selectedBranch)
    })
  }, [up, selectedBranch])

  // Only TODAY's sessions for the list below
  const todayStart = useMemo(() => todayFloor(), [])
  const todayEnd = useMemo(() => new Date(todayStart.getTime() + 24 * 60 * 60 * 1000), [todayStart])

  const todayOnly = useMemo(() => {
    return branchFiltered.filter((s) => {
      const dt = new Date(s.dt)
      return dt >= todayStart && dt < todayEnd
    })
  }, [branchFiltered, todayStart, todayEnd])

  useEffect(() => { setSelectedSid('') }, [selectedBranch])
  useEffect(() => { setPage(1) }, [selectedBranch])

  const regCounts = useMemo(() => {
    const counts = {}
    ;(registrations || []).forEach((reg) => {
      const sid = reg.sessionId || reg['Session ID'] || reg['sessionId'] || ''
      if (sid) counts[sid] = (counts[sid] || 0) + 1
    })
    return counts
  }, [registrations])

  const totalPages = Math.max(1, Math.ceil(todayOnly.length / PAGE_SIZE))
  const p = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => todayOnly.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE),
    [todayOnly, p]
  )

  const goTo = useCallback(
    (sid) => navigate(`/scan/${encodeURIComponent(sid)}`),
    [navigate]
  )

  const go = () => {
    if (!selectedSid) { alert('Pick a session'); return }
    goTo(selectedSid)
  }

  const selectedBranchName = selectedBranch ? (branchMap[selectedBranch] || '') : ''

  return (
    <section id="attendance">
      <div className="panel">
        <h2>Select a session</h2>

        {/* Branch filter */}
        {branches.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Session dropdown + go button */}
        <div className="row wrap">
          <select
            value={selectedSid}
            onChange={(e) => setSelectedSid(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">— {loading ? 'Loading…' : 'select session'} —</option>
            {branchFiltered.map((s) => (
              <option key={s.id} value={s.id}>{title(s)}</option>
            ))}
          </select>
          <button className="primary" onClick={go}>
            Go to Scanner
          </button>
        </div>

        {/* Today only */}
        <h3 style={{ marginTop: 20 }}>
          Today
          {selectedBranchName && (
            <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8, color: '#6b7280' }}>
              — {selectedBranchName}
            </span>
          )}
        </h3>

        <div className="list">
          {loading ? (
            <div className="caption">Loading sessions...</div>
          ) : todayOnly.length === 0 ? (
            <div className="caption muted">
              {selectedBranch ? 'No sessions today for this branch.' : 'No sessions today.'}
            </div>
          ) : (
            pageItems.map((s) => {
              const ids = s.branchIds || (s.branchId ? [s.branchId] : [])
              const branchNames = ids.map((id) => branchMap[id]).filter(Boolean)
              return (
                <SessionItem
                  key={s.id}
                  session={s}
                  regCount={regCounts[s.id] || (s.reg || []).length}
                  attCount={(s.att || []).length}
                  branchNames={branchNames}
                  onScan={goTo}
                />
              )
            })
          )}
        </div>

        <Pagination
          page={p}
          totalPages={totalPages}
          total={todayOnly.length}
          onPrev={() => setPage((n) => Math.max(1, n - 1))}
          onNext={() => setPage((n) => Math.min(totalPages, n + 1))}
        />
      </div>
    </section>
  )
}
