import { useEffect, useState } from 'react'

const ICONS = {
  sessions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  member: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon">
      <circle cx="9" cy="8" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="17" cy="9" r="3" />
      <path d="M21 21v-1.5a3.5 3.5 0 0 0-3.5-3.5H16" />
    </svg>
  ),
  memberLookup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon nav-subicon">
      <circle cx="11" cy="11" r="6" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  membersList: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon nav-subicon">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon">
      <path d="M4 19V5M4 19h16M8 15v-6M12 15V7M16 15v-4" />
    </svg>
  ),
  approvals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon">
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  branches: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon">
      <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-chevron">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
}

const ITEMS = [
  { id: 'sessions', label: 'Session Management', icon: ICONS.sessions },
  { id: 'add', label: 'Add Sessions', icon: ICONS.add },
  { id: 'branches', label: 'Branches', icon: ICONS.branches },
  { id: 'approvals', label: 'Approvals', icon: ICONS.approvals },
  {
    id: 'memberGroup',
    label: 'Member',
    icon: ICONS.member,
    children: [
      { id: 'member', label: 'Session Member Lookup', icon: ICONS.memberLookup },
      { id: 'members', label: 'Members', icon: ICONS.membersList },
    ],
  },
  { id: 'reports', label: 'Reports & Export', icon: ICONS.reports },
]

function isChildActive(group, active) {
  return group.children?.some((c) => c.id === active)
}

export default function Sidebar({ active, onSelect, badges = {} }) {
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {}
    ITEMS.forEach((it) => {
      if (it.children) initial[it.id] = isChildActive(it, active)
    })
    return initial
  })

  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false
      const next = { ...prev }
      ITEMS.forEach((it) => {
        if (it.children && isChildActive(it, active) && !next[it.id]) {
          next[it.id] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [active])

  const toggleGroup = (id) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <aside className="admin-sidebar" aria-label="Admin navigation">
      <h3>Admin</h3>
      <div className="nav-list" role="tablist">
        {ITEMS.map((it) => {
          if (!it.children) {
            const badge = badges[it.id]
            return (
              <button
                key={it.id}
                type="button"
                className={'nav-item' + (active === it.id ? ' active' : '')}
                onClick={() => onSelect(it.id)}
                role="tab"
                aria-selected={active === it.id}
              >
                {it.icon}
                <span>{it.label}</span>
                {badge > 0 && (
                  <span className="nav-badge" aria-label={`${badge} pending`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            )
          }
          const open = openGroups[it.id]
          const hasActiveChild = isChildActive(it, active)
          return (
            <div key={it.id} className="nav-group">
              <button
                type="button"
                className={
                  'nav-item nav-parent' +
                  (open ? ' open' : '') +
                  (hasActiveChild ? ' has-active' : '')
                }
                onClick={() => toggleGroup(it.id)}
                aria-expanded={open}
                aria-controls={`nav-children-${it.id}`}
              >
                {it.icon}
                <span>{it.label}</span>
                {ICONS.chevron}
              </button>
              {open && (
                <div
                  id={`nav-children-${it.id}`}
                  className="nav-children"
                  role="group"
                >
                  {it.children.map((c) => {
                    const childBadge = badges[c.id]
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={
                          'nav-item nav-subitem' +
                          (active === c.id ? ' active' : '')
                        }
                        onClick={() => onSelect(c.id)}
                        role="tab"
                        aria-selected={active === c.id}
                      >
                        {c.icon}
                        <span>{c.label}</span>
                        {childBadge > 0 && (
                          <span className="nav-badge" aria-label={`${childBadge} pending`}>
                            {childBadge > 99 ? '99+' : childBadge}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export function findSectionMeta(id) {
  for (const it of ITEMS) {
    if (it.id === id) return { title: it.label, parent: null }
    if (it.children) {
      const child = it.children.find((c) => c.id === id)
      if (child) return { title: child.label, parent: it.label }
    }
  }
  return { title: id, parent: null }
}
