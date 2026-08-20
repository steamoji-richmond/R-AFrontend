// Pure helper functions ported from the original HTML app.

export function todayFloor() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function title(s) {
  const dt = new Date(s.dt)
  return (
    dt.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' • ' +
    dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' — ' +
    s.topic
  )
}

export function ymd(date) {
  return new Date(date).toISOString().slice(0, 10)
}

export function sameMonth(a, b) {
  const A = new Date(a)
  const B = new Date(b)
  return A.getFullYear() === B.getFullYear() && A.getMonth() === B.getMonth()
}

export function sessionCapacity(s) {
  const c = s && s.capacity != null ? Number(s.capacity) : NaN
  return isFinite(c) && c > 0 ? Math.floor(c) : 10
}

export function listUpcoming(sessions) {
  const start = todayFloor()
  return (sessions || [])
    .filter((s) => new Date(s.dt) >= start)
    .sort((a, b) => new Date(a.dt) - new Date(b.dt))
}

export function getSundaysOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const out = []
  for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) out.push(new Date(d))
  }
  return out
}

export function getRegistrationRecordId(reg) {
  if (!reg) return ''
  return String(
    reg.id || reg['ID'] || reg['Registration ID'] || reg['registrationId'] || ''
  ).trim()
}

export function registrationRowSessionId(r) {
  if (!r) return ''
  return String(r.sessionId || r['Session ID'] || r['sessionId'] || '').trim()
}

export function normalizeSessionRegIds(s) {
  let regIds = (s && s.reg) || []
  if (!Array.isArray(regIds)) {
    try {
      regIds = typeof regIds === 'string' ? JSON.parse(regIds) : []
    } catch (e) {
      regIds = []
    }
  }
  return regIds
}

export function uniqueSessionRegSlotCount(reg) {
  if (!reg || !reg.length) return 0
  const seen = {}
  let n = 0
  for (let i = 0; i < reg.length; i++) {
    const x = reg[i]
    const key =
      typeof x === 'string'
        ? x
        : x && x.id != null
        ? String(x.id)
        : JSON.stringify(x)
    if (seen[key]) continue
    seen[key] = true
    n++
  }
  return n
}

export function capLeft(s) {
  return sessionCapacity(s) - uniqueSessionRegSlotCount(s.reg || [])
}

const _capacityCache = {}
export function clearCapacityCache() {
  for (const k in _capacityCache) delete _capacityCache[k]
}

export function capLeftFromSheets(s, sheetRegs) {
  const cap = sessionCapacity(s)
  if (!sheetRegs || !Array.isArray(sheetRegs) || sheetRegs.length === 0) return cap

  const sessionId = String((s && s.id) || '').trim()
  const cacheKey =
    (sessionId || (s.dt ? new Date(s.dt).toISOString() : '')) + '|cap:' + cap
  if (_capacityCache[cacheKey] !== undefined) return _capacityCache[cacheKey]

  const sessionDate = new Date(s.dt).toISOString().slice(0, 10)
  const sessionTime = new Date(s.dt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  const seen = {}
  let count = 0
  for (const r of sheetRegs) {
    if (!r) continue
    const regSid = registrationRowSessionId(r)
    let matches = false
    if (sessionId && regSid && regSid === sessionId) {
      matches = true
    } else if (sessionId && !regSid) {
      const regDate =
        r.sessionDate ||
        (r.registeredDateAndTime
          ? new Date(r.registeredDateAndTime).toISOString().slice(0, 10)
          : '')
      const regTime =
        r.sessionTime ||
        (r.registeredDateAndTime
          ? new Date(r.registeredDateAndTime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '')
      if (regDate === sessionDate && regTime === sessionTime) matches = true
    }
    if (!matches) continue

    // Skip unconfirmed (awaiting payment) registrations — they don't hold a seat
    const ps = r.paymentStatus || r['Payment Status'] || ''
    if (ps === 'pending') continue

    const rid = getRegistrationRecordId(r)
    if (rid) {
      if (seen['id:' + rid]) continue
      seen['id:' + rid] = true
    } else {
      const pe = String(r.parentEmail || r['Parent Email'] || '').toLowerCase().trim()
      const fn = String(r.firstName || r['First Name'] || '').toLowerCase().trim()
      const ln = String(r.lastName || r['Last Name'] || '').toLowerCase().trim()
      const fp = `fp:${sessionId}|${regSid}|${sessionDate}|${sessionTime}|${pe}|${fn}|${ln}`
      if (seen[fp]) continue
      seen[fp] = true
    }
    count++
  }
  const seats = Math.max(0, cap - count)
  _capacityCache[cacheKey] = seats
  return seats
}

/**
 * Check if a specific kid (by badgeId, or firstName+lastName+parentEmail)
 * is already registered for a session in the given month.
 */
export function kidRegisteredForMonthFromSheets(member, parentEmail, when, sheetRegs) {
  if (!sheetRegs || !Array.isArray(sheetRegs) || sheetRegs.length === 0) return false
  const badgeId = member.badgeId || ''
  const firstName = (member.firstName || '').toLowerCase().trim()
  const lastName = (member.lastName || '').toLowerCase().trim()
  const email = (parentEmail || '').toLowerCase().trim()
  const whenMonth = new Date(when).getMonth()
  const whenYear = new Date(when).getFullYear()

  const getSessionDate = (r) => {
    if (r.sessionDate) return new Date(r.sessionDate)
    if (r.registeredDateAndTime) return new Date(r.registeredDateAndTime)
    return null
  }

  return sheetRegs.some((r) => {
    if (!r) return false
    // Abandoned / unpaid registrations don't count — the person can try again
    const ps = r.paymentStatus || r['Payment Status'] || ''
    if (ps === 'pending') return false

    if (badgeId && r.badgeId && r.badgeId === badgeId) {
      const d = getSessionDate(r)
      return d && d.getMonth() === whenMonth && d.getFullYear() === whenYear
    }
    if (!badgeId && firstName && lastName && email) {
      const rFn = (r.firstName || '').toLowerCase().trim()
      const rLn = (r.lastName || '').toLowerCase().trim()
      const rEm = (r.parentEmail || '').toLowerCase().trim()
      if (rFn === firstName && rLn === lastName && rEm === email) {
        const d = getSessionDate(r)
        return d && d.getMonth() === whenMonth && d.getFullYear() === whenYear
      }
    }
    return false
  })
}

/**
 * Find the registration row for this member + session.
 */
export function findRegistrationRowForSession(s, member, parentEmail, registrations) {
  if (!s || !member || !registrations || !registrations.length) return null
  const badgeId = String(member.badgeId || '').trim()
  const firstName = (member.firstName || '').toLowerCase().trim()
  const lastName = (member.lastName || '').toLowerCase().trim()
  const email = (parentEmail || '').toLowerCase().trim()
  const sid = s.id

  const sessionMatches = (reg) => reg && (reg.sessionId === sid || reg.sessionID === sid)
  const nameEmailMatches = (reg) => {
    if (!firstName || !lastName || !email) return false
    const rfn = (reg.firstName || reg['First Name'] || '').toLowerCase().trim()
    const rln = (reg.lastName || reg['Last Name'] || '').toLowerCase().trim()
    const rem = (reg.parentEmail || reg['Parent Email'] || reg.email || '').toLowerCase().trim()
    return rfn === firstName && rln === lastName && rem === email
  }
  const regBadge = (reg) =>
    String(reg.badgeId || reg['Badge ID'] || reg['badgeId'] || '').trim()

  if (badgeId) {
    const byBadge = registrations.find((r) => sessionMatches(r) && regBadge(r) === badgeId)
    if (byBadge) return byBadge
  }
  if (!badgeId && firstName && lastName && email) {
    const byName = registrations.find((r) => sessionMatches(r) && nameEmailMatches(r))
    if (byName) return byName
  }
  if (badgeId && firstName && lastName && email) {
    const byName = registrations.find((r) => sessionMatches(r) && nameEmailMatches(r))
    if (byName) return byName
  }
  const regIds = normalizeSessionRegIds(s)
  for (const rid of regIds) {
    if (rid == null || rid === '') continue
    const ridStr = String(rid).trim()
    const reg = registrations.find((r) => getRegistrationRecordId(r) === ridStr)
    if (!reg || !sessionMatches(reg)) continue
    if (badgeId && regBadge(reg) === badgeId) return reg
    if (nameEmailMatches(reg)) return reg
  }
  return null
}

const GST_RATE = 0.05

function computeGstBreakdown(subtotal) {
  const base = Math.round(Number(subtotal) * 100) / 100
  if (base <= 0) return { subtotal: 0, gstAmount: 0, total: 0 }
  const gstAmount = Math.round(base * GST_RATE * 100) / 100
  const total = Math.round((base + gstAmount) * 100) / 100
  return { subtotal: base, gstAmount, total }
}

/**
 * Compute the price a member must pay for a session (mirrors backend logic).
 *  - Annual members         → FREE
 *  - Non-annual members     → 40% off (pay 60%)
 *  - Non-Steamoji / none    → full price
 *  - session.price === 0    → FREE
 *  - All paid amounts include 5% GST at checkout
 */
export function computeMemberPrice(session, member) {
  const base = Number(session?.price) || 0
  const currency = 'CAD'
  if (base <= 0) {
    return { amount: 0, taxAmount: 0, totalAmount: 0, currency, isFree: true, membershipType: member?.membershipType || 'none' }
  }
  const type = (member && member.membershipType) || 'none'
  if (type === 'yearly')
    return { amount: 0, taxAmount: 0, totalAmount: 0, currency, isFree: true, membershipType: 'yearly' }
  let subtotal = base
  if (type === 'semi-yearly') subtotal = Math.round(base * 0.6 * 100) / 100
  const tax = computeGstBreakdown(subtotal)
  return {
    amount: tax.subtotal,
    taxAmount: tax.gstAmount,
    totalAmount: tax.total,
    currency,
    isFree: false,
    membershipType: type === 'semi-yearly' ? 'semi-yearly' : 'none',
  }
}

export function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(Number(amount) || 0)
  } catch {
    return `$${(Number(amount) || 0).toFixed(2)}`
  }
}

export function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function toCsv(rows) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          v = v == null ? '' : String(v)
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
        })
        .join(',')
    )
    .join('\n')
}
