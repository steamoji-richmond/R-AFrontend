import CONFIG, { getApiUrl } from '../config.js'

const { GOOGLE_SHEETS } = CONFIG

// Simple in-memory registrations cache with TTL
const registrationsCache = {
  data: [],
  timestamp: 0,
  ttl: 30000,
}

export function clearRegistrationsCache() {
  registrationsCache.timestamp = 0
  registrationsCache.data = []
}

function apiConfigured() {
  return !!getApiUrl()
}

function buildUrl(action, extraParams) {
  let url = getApiUrl()
  const separator = url.indexOf('?') === -1 ? '?' : '&'
  url += `${separator}action=${encodeURIComponent(action)}`
  if (extraParams) {
    Object.keys(extraParams).forEach((k) => {
      const v = extraParams[k]
      if (v == null) return
      url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    })
  }
  return url
}

async function getJson(action, params) {
  if (!apiConfigured()) return null
  const url = buildUrl(action, params)
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function postJson(action, payload, params) {
  if (!apiConfigured()) return { success: true }
  const url = buildUrl(action, params)
  const res = await fetch(url, {
    method: 'POST',
    // text/plain to avoid CORS preflight; Apps Script parses JSON body
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload || {}),
  })
  if (res.status === 405) {
    throw new Error(
      '405 Method Not Allowed: API URL must end with /exec (e.g. http://your-server:4000/exec).'
    )
  }
  if (res.status === 404) {
    throw new Error(
      '404 Not Found: Check VITE_API_URL — it must point to the backend /exec endpoint, not the server root.'
    )
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch (e) {
    return { success: true, message: text }
  }
}

export async function lookupMembersByEmail(email) {
  try {
    const data = await getJson('lookup', { email })
    return (data && data.success && data.members) || []
  } catch (err) {
    console.error('lookupMembersByEmail error', err)
    return []
  }
}

export async function getValidationData() {
  try {
    const data = await getJson('getValidation')
    return (data && data.success && data.members) || []
  } catch (err) {
    console.error('getValidationData error', err)
    return []
  }
}

export async function updateValidationMember(memberData) {
  const data = await postJson('updateValidation', memberData)
  if (!data.success) throw new Error(data.error || 'Failed to update member')
  return data
}

export async function deleteValidationMember(rowIndex) {
  const data = await postJson('deleteValidation', { rowIndex }, { rowIndex })
  if (!data.success) throw new Error(data.error || 'Failed to delete member')
  return data
}

export async function getPendingMembers() {
  try {
    const data = await getJson('getPendingMembers')
    return (data && data.success && data.members) || []
  } catch (err) {
    console.error('getPendingMembers error', err)
    return []
  }
}

export async function approveMember(memberId, approvedBy = '') {
  const data = await postJson('approveMember', { memberId, approvedBy })
  if (!data.success) throw new Error(data.error || 'Failed to approve member')
  return data
}

export async function rejectMember(memberId, reason = '', approvedBy = '') {
  const data = await postJson('rejectMember', { memberId, reason, approvedBy })
  if (!data.success) throw new Error(data.error || 'Failed to reject member')
  return data
}

export async function getRegistrationsFromSheets(forceRefresh = false) {
  const now = Date.now()
  if (
    !forceRefresh &&
    registrationsCache.data.length > 0 &&
    now - registrationsCache.timestamp < registrationsCache.ttl
  ) {
    return registrationsCache.data
  }
  try {
    const data = await getJson('getRegistrations')
    if (data && data.success && data.registrations) {
      registrationsCache.data = data.registrations
      registrationsCache.timestamp = Date.now()
      return data.registrations
    }
    return []
  } catch (err) {
    console.error('getRegistrationsFromSheets error', err)
    return registrationsCache.data.length ? registrationsCache.data : []
  }
}

export async function getSessionsFromSheets() {
  try {
    const data = await getJson('getSessions')
    if (data && data.success && data.sessions) return data.sessions
    if (data && data.error) console.error('getSessions error', data.error)
    return []
  } catch (err) {
    console.error('getSessionsFromSheets error', err)
    return []
  }
}

export async function saveSessionToSheets(sessionData) {
  const data = await postJson('saveSession', sessionData)
  if (!data.success) throw new Error(data.error || 'Failed to save session')
  return data
}

export async function deleteRegistrationFromSheets(registrationId) {
  const data = await postJson(
    'deleteRegistration',
    { registrationId },
    { registrationId }
  )
  if (!data.success) throw new Error(data.error || 'Failed to delete registration')
  clearRegistrationsCache()
  return data
}

export async function deleteSessionFromSheets(sessionId, reason = '') {
  const data = await postJson('deleteSession', { sessionId, reason }, { sessionId })
  if (!data.success) throw new Error(data.error || 'Failed to delete session')
  return data
}

export async function saveRegistrationToSheets(registrationData) {
  const data = await postJson('register', registrationData)
  if (!data.success) throw new Error(data.error || 'Failed to save')
  clearRegistrationsCache()
  return data
}

export async function updateRegistrationBadgeId(registrationId, badgeId) {
  const data = await postJson('updateRegistration', {
    id: registrationId,
    badgeId,
  })
  if (!data.success) throw new Error(data.error || 'Failed to update registration')
  clearRegistrationsCache()
  return data
}

export async function getSteamojiTokenStatus() {
  try {
    const data = await getJson('steamojiTokenStatus')
    return data || { tokenConfigured: false }
  } catch {
    return { tokenConfigured: false }
  }
}

export async function importSteamojiMembers({
  authToken,
  organizationID,
  branchIds = [],
  onlyUpgraded = false,
}) {
  const data = await postJson('importSteamoji', {
    authToken,
    organizationID,
    branchIds,
    onlyUpgraded,
  })
  if (!data.success) throw new Error(data.error || 'Import failed')
  return data
}

export async function getImportConflicts() {
  try {
    const data = await getJson('getImportConflicts')
    return (data && data.success && data.conflicts) || []
  } catch (err) {
    console.error('getImportConflicts error', err)
    return []
  }
}

export async function resolveImportConflict(id, memberData) {
  const data = await postJson('resolveImportConflict', { id, ...memberData })
  if (!data.success) throw new Error(data.error || 'Failed to resolve conflict')
  return data
}

export async function dismissImportConflict(id) {
  const data = await postJson('dismissImportConflict', { id })
  if (!data.success) throw new Error(data.error || 'Failed to dismiss conflict')
  return data
}

export async function updateAllRegistrationsForUser(userData) {
  const data = await postJson('updateAllRegistrationsForUser', userData)
  if (!data.success) throw new Error(data.error || 'Failed to update registrations')
  clearRegistrationsCache()
  return data
}

export async function createPaymentCheckout(registrationId) {
  const data = await postJson(
    'createPaymentLink',
    { registrationId },
    { registrationId }
  )
  if (!data.success) throw new Error(data.error || 'Failed to create checkout')
  return data
}

export async function confirmPayment(registrationId) {
  const data = await postJson(
    'confirmPayment',
    { registrationId },
    { registrationId }
  )
  if (!data.success) throw new Error(data.error || 'Failed to confirm payment')
  return data
}

// ------------------------------------------------------------------
// Branches
// ------------------------------------------------------------------

/**
 * Fetch every branch. Pass `{ activeOnly: true }` to filter out deactivated
 * branches — useful on the public sign-up form so closed locations don't
 * show up as choices.
 */
export async function getBranches({ activeOnly = false } = {}) {
  try {
    const params = activeOnly ? { activeOnly: '1' } : {}
    const data = await getJson('getBranches', params)
    return (data && data.success && data.branches) || []
  } catch (err) {
    console.error('getBranches error', err)
    return []
  }
}

export async function saveBranch(branchData) {
  const data = await postJson('saveBranch', branchData)
  if (!data.success) throw new Error(data.error || 'Failed to save branch')
  return data
}

export async function deleteBranch(id, { force = false } = {}) {
  const data = await postJson('deleteBranch', { id, force }, { id })
  if (!data.success) throw new Error(data.error || 'Failed to delete branch')
  return data
}

export async function setBranchActive(id, active) {
  const data = await postJson('setBranchActive', { id, active }, { id })
  if (!data.success) throw new Error(data.error || 'Failed to update branch')
  return data
}

/**
 * Link (or unlink) this branch to a set of other branches. The backend
 * maintains symmetry, so we only have to pass one side.
 *   action: 'add' | 'remove' | 'set'
 */
export async function updateBranchLinks(id, linkedBranchIds, action = 'add') {
  const data = await postJson('linkBranches', {
    id,
    linkedBranchIds,
    action,
  })
  if (!data.success) throw new Error(data.error || 'Failed to update branch links')
  return data
}

/**
 * Helper: after saving a new registration, add its ID to the session's reg[] array.
 */
export async function updateSessionAfterRegistration(sessionId, registrationId) {
  if (!sessionId || !registrationId) return { success: true }
  const sessions = await getSessionsFromSheets()
  const sessionToUpdate = sessions.find((s) => s.id === sessionId)
  if (!sessionToUpdate) return { success: true, message: 'Session not found' }

  if (!Array.isArray(sessionToUpdate.reg)) sessionToUpdate.reg = []

  const exists = sessionToUpdate.reg.some((r) => {
    if (typeof r === 'string') return r === registrationId
    if (r && r.id) return r.id === registrationId
    return false
  })
  if (exists) return { success: true, message: 'Registration already exists' }

  sessionToUpdate.reg.push(registrationId)
  await saveSessionToSheets(sessionToUpdate)
  return { success: true, regCount: sessionToUpdate.reg.length }
}
