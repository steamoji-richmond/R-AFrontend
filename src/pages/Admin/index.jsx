import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { setAdminKey, getAdminKey } from '../../utils/authKeys.js'
import { verifyAdminPassword } from '../../api/sheets.js'
import {
  getBranches,
  getImportConflicts,
  getPendingMembers,
  getSessionsFromSheets,
} from '../../api/sheets.js'
import Sidebar, { findSectionMeta } from './Sidebar.jsx'
import SessionsTable from './SessionsTable.jsx'
import AddSessionsSection from './AddSessionsSection.jsx'
import Approvals from './Approvals.jsx'
import MemberLookup from './MemberLookup.jsx'
import Members from './Members.jsx'
import Reports from './Reports.jsx'
import Branches from './Branches.jsx'

const SECTION_SUBTITLES = {
  sessions: 'View, edit, and manage all workshop sessions.',
  add: 'Create a new session.',
  branches:
    'Add new locations, edit them, and link branches so their members can share workshops.',
  approvals: 'Approve or reject new member sign-ups before they can register.',
  member: 'Look up a specific member and see their registered sessions.',
  members: 'Add, edit, and remove member records.',
  reports: '',
}

export default function Admin() {
  const { passwordDialog, adminUnlocked, setAdminUnlocked } = useApp()
  const [sessions, setSessions] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [section, setSection] = useState('sessions')
  const [pendingCount, setPendingCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSessionsFromSheets()
      setSessions(data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBranches = useCallback(async () => {
    try {
      const list = await getBranches({ admin: true })
      setBranches(Array.isArray(list) ? list : [])
    } catch {
      // non-critical — branches page has its own loader
    }
  }, [])

  const refreshPendingCount = useCallback(async () => {
    try {
      const list = await getPendingMembers()
      setPendingCount(Array.isArray(list) ? list.length : 0)
    } catch {
      // Silent — non-critical.
    }
  }, [])

  const refreshConflictCount = useCallback(async () => {
    try {
      const list = await getImportConflicts()
      setConflictCount(Array.isArray(list) ? list.length : 0)
    } catch {
      // Silent — non-critical.
    }
  }, [])

  useEffect(() => {
    if (adminUnlocked) return
    ;(async () => {
      const code = await passwordDialog('Enter admin password')
      if (code != null && (await verifyAdminPassword(code))) {
        setAdminKey(code)
        setAdminUnlocked(true)
      } else if (code != null) {
        alert('Incorrect password')
      }
    })()
  }, [adminUnlocked, passwordDialog, setAdminUnlocked])

  // Re-use stored key for this browser session after refresh
  useEffect(() => {
    if (!adminUnlocked && getAdminKey()) {
      setAdminUnlocked(true)
    }
  }, [adminUnlocked, setAdminUnlocked])

  useEffect(() => {
    if (!adminUnlocked) return
    loadSessions()
    loadBranches()
    refreshPendingCount()
    refreshConflictCount()
  }, [adminUnlocked, loadSessions, loadBranches, refreshPendingCount, refreshConflictCount])

  useEffect(() => {
    if (!adminUnlocked) return
    const t = setInterval(() => {
      refreshPendingCount()
      refreshConflictCount()
    }, 60000)
    return () => clearInterval(t)
  }, [adminUnlocked, refreshPendingCount, refreshConflictCount])

  if (!adminUnlocked) {
    return (
      <div className="admin-locked">
        <div className="panel">
          <p className="caption" style={{ margin: 0 }}>
            Admin access required.
          </p>
        </div>
      </div>
    )
  }

  const handleSelect = (id, subTab) => {
    setSection(id)
    if (id === 'sessions') loadSessions()
    if (id === 'branches') loadBranches()
    if (id === 'approvals') refreshPendingCount()
    if (subTab) window.__adminSubTab = subTab // picked up by Members component
  }

  const notifications = [
    pendingCount > 0 && {
      id: 'approvals',
      label: `${pendingCount} pending sign-up${pendingCount !== 1 ? 's' : ''} waiting for approval`,
      section: 'approvals',
      subTab: null,
      color: '#b45309',
      bg: '#fffbeb',
      border: '#fde68a',
    },
    conflictCount > 0 && {
      id: 'conflicts',
      label: `${conflictCount} import conflict${conflictCount !== 1 ? 's' : ''} need attention`,
      section: 'members',
      subTab: 'conflicts',
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fca5a5',
    },
  ].filter(Boolean)

  const meta = findSectionMeta(section)
  const subtitle = SECTION_SUBTITLES[section] || ''

  return (
    <div className="admin-shell">
      <Sidebar
        active={section}
        onSelect={handleSelect}
        badges={{ approvals: pendingCount, members: conflictCount }}
      />
      <div className="admin-main">
        {section !== 'reports' && (
          <header className="admin-toolbar">
            <div className="admin-toolbar-text">
              {meta.parent && (
                <div className="admin-breadcrumb">
                  <span>{meta.parent}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span className="current">{meta.title}</span>
                </div>
              )}
              <h1 className="admin-title">{meta.title}</h1>
              {subtitle && <p className="admin-subtitle">{subtitle}</p>}
            </div>
            {loading && section === 'sessions' && (
              <div className="admin-toolbar-aside" aria-live="polite">
                <span className="admin-pill">Loading…</span>
              </div>
            )}
          </header>
        )}

        {notifications.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 0 12px' }}>
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelect(n.section, n.subTab)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 16px',
                  background: n.bg,
                  border: `1px solid ${n.border}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                  color: n.color,
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 16 }}>🔔</span>
                <span style={{ flex: 1 }}>{n.label}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>View →</span>
              </button>
            ))}
          </div>
        )}

        <div className="admin-view" id="admin-view">
          {section === 'sessions' && (
            <SessionsTable
              sessions={sessions}
              branches={branches}
              onRefresh={loadSessions}
            />
          )}
          {section === 'add' && (
            <AddSessionsSection branches={branches} onChanged={loadSessions} />
          )}
          {section === 'branches' && <Branches onChange={loadBranches} />}
          {section === 'approvals' && (
            <Approvals onChange={refreshPendingCount} />
          )}
          {section === 'member' && <MemberLookup />}
          {section === 'members' && <Members branches={branches} />}
          {section === 'reports' && <Reports />}
        </div>
      </div>
    </div>
  )
}
