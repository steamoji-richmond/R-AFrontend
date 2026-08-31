import { getApiUrl } from '../config.js'
import { getAdminKey, getAttendKey } from '../utils/authKeys.js'

// Simple in-memory registrations cache with TTL
const registrationsCache = {
  data: [],
  key: '',
  timestamp: 0,
  ttl: 30000,
}

export function clearRegistrationsCache() {
  registrationsCache.timestamp = 0
  registrationsCache.data = []
  registrationsCache.key = ''
}

function apiConfigured() {
  return !!getApiUrl()
}

function buildUrl(action, extraParams, auth) {
  let url = getApiUrl()
  const separator = url.indexOf('?') === -1 ? '?' : '&'
  url += `${separator}action=${encodeURIComponent(action)}`
  const params = { ...(extraParams || {}) }
  // Query fallback — Vercel proxy may not forward custom headers on all paths
  if (auth === 'admin') {
    const key = getAdminKey()
    if (key) params.adminKey = key
  } else if (auth === 'attend') {
    const key = getAttendKey()
    if (key) params.attendKey = key
  }
  Object.keys(params).forEach((k) => {
    const v = params[k]
    if (v == null) return
    url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`
  })
  return url
}

function authHeaders(auth) {
  const headers = {}
  if (auth === 'admin') {
    const key = getAdminKey()
    if (key) headers['X-Admin-Key'] = key
  } else if (auth === 'attend') {
    const key = getAttendKey()
    if (key) headers['X-Attend-Key'] = key
  }
  return headers
}

async function getJson(action, params, auth) {
  if (!apiConfigured()) return null
  const url = buildUrl(action, params, auth)
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders(auth) },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function postJson(action, payload, params, auth) {
  if (!apiConfigured()) return { success: true }
  const url = buildUrl(action, params, auth)
  const body = { ...(payload || {}) }
  if (auth === 'admin') {
    const key = getAdminKey()
    if (key) body.adminKey = key
  } else if (auth === 'attend') {
    const key = getAttendKey()
    if (key) body.attendKey = key
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      ...authHeaders(auth),
    },
    body: JSON.stringify(body),
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

export async function verifyAdminPassword(password) {
  try {
    const data = await postJson('verifyAdmin', { password })
    return !!(data && data.success)
  } catch {
    return false
  }
}

export async function verifyAttendPassword(password) {
  try {
    const data = await postJson('verifyAttend', { password })
    return !!(data && data.success)
  } catch {
    return false
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
    const data = await getJson('getValidation', null, 'admin')
    return (data && data.success && data.members) || []
  } catch (err) {
    console.error('getValidationData error', err)
    return []
  }
}

export async function lookupBadgeById(badge) {
  try {
    const data = await getJson('lookupBadge', { badge }, 'attend')
    return (data && data.success && data.member) || null
  } catch (err) {
    console.error('lookupBadgeById error', err)
    return null
  }
}

export async function getSessionScanData(sessionId) {
  try {
    const data = await getJson('getSessionScanData', { sessionId }, 'attend')
    if (data && data.success) {
      return {
        registrations: data.registrations || [],
        members: data.members || [],
      }
    }
    return { registrations: [], members: [] }
  } catch (err) {
    console.error('getSessionScanData error', err)
    return { registrations: [], members: [] }
  }
}

export async function updateValidationMember(memberData, auth) {
  const data = await postJson('updateValidation', memberData, null, auth)
  if (!data.success) throw new Error(data.error || 'Failed to update member')
  return data
}

export async function deleteValidationMember(rowIndex) {
  const data = await postJson('deleteValidation', { rowIndex }, { rowIndex }, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to delete member')
  return data
}

export async function getPendingMembers() {
  try {
    const data = await getJson('getPendingMembers', null, 'admin')
    return (data && data.success && data.members) || []
  } catch (err) {
    console.error('getPendingMembers error', err)
    return []
  }
}

export async function approveMember(memberId, approvedBy = '') {
  const data = await postJson('approveMember', { memberId, approvedBy }, null, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to approve member')
  return data
}

export async function rejectMember(memberId, reason = '', approvedBy = '') {
  const data = await postJson('rejectMember', { memberId, reason, approvedBy }, null, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to reject member')
  return data
}

export async function getRegistrationsFromSheets(arg = false) {
  const opts =
    typeof arg === 'object' && arg !== null
      ? arg
      : { forceRefresh: !!arg }
  const {
    forceRefresh = false,
    email,
    sessionId,
    auth = email ? undefined : 'admin',
  } = opts

  const cacheKey = `${email || ''}|${sessionId || ''}|${auth || ''}`
  const now = Date.now()
  if (
    !forceRefresh &&
    registrationsCache.key === cacheKey &&
    registrationsCache.data.length >= 0 &&
    now - registrationsCache.timestamp < registrationsCache.ttl
  ) {
    return registrationsCache.data
  }
  try {
    const params = {}
    if (email) params.email = email
    if (sessionId) params.sessionId = sessionId
    const data = await getJson('getRegistrations', params, auth)
    if (data && data.success && data.registrations) {
      registrationsCache.data = data.registrations
      registrationsCache.key = cacheKey
      registrationsCache.timestamp = Date.now()
      return data.registrations
    }
    return []
  } catch (err) {
    console.error('getRegistrationsFromSheets error', err)
    return registrationsCache.key === cacheKey && registrationsCache.data.length
      ? registrationsCache.data
      : []
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

export async function saveSessionToSheets(sessionData, auth = 'admin') {
  const data = await postJson('saveSession', sessionData, null, auth)
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
  const data = await postJson('deleteSession', { sessionId, reason }, { sessionId }, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to delete session')
  return data
}

export async function saveRegistrationToSheets(registrationData, { admin = false } = {}) {
  const data = await postJson('register', registrationData, null, admin ? 'admin' : undefined)
  if (!data.success) throw new Error(data.error || 'Failed to save')
  clearRegistrationsCache()
  return data
}

export async function adminAddRegistrationToSession(registrationData) {
  return saveRegistrationToSheets({ ...registrationData, adminAdd: true }, { admin: true })
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

export async function getSteamojiTokenStatus(branchId) {
  try {
    const params = branchId ? { branchId } : null
    const data = await getJson('steamojiTokenStatus', params, 'admin')
    return data || { tokenConfigured: false, cookieConfigured: false }
  } catch {
    return { tokenConfigured: false, cookieConfigured: false }
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
  }, null, 'admin')
  if (!data.success) throw new Error(data.error || 'Import failed')
  return data
}

export async function getImportConflicts() {
  try {
    const data = await getJson('getImportConflicts', null, 'admin')
    return (data && data.success && data.conflicts) || []
  } catch (err) {
    console.error('getImportConflicts error', err)
    return []
  }
}

export async function resolveImportConflict(id, memberData) {
  const data = await postJson('resolveImportConflict', { id, ...memberData }, null, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to resolve conflict')
  return data
}

export async function dismissImportConflict(id) {
  const data = await postJson('dismissImportConflict', { id }, null, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to dismiss conflict')
  return data
}

export async function updateAllRegistrationsForUser(userData, auth = 'attend') {
  const data = await postJson('updateAllRegistrationsForUser', userData, null, auth)
  if (!data.success) throw new Error(data.error || 'Failed to update registrations')
  clearRegistrationsCache()
  return data
}

export async function createPaymentCheckout(registrationId, { sendPaymentEmail = false } = {}) {
  const data = await postJson(
    'createPaymentLink',
    { registrationId, sendPaymentEmail: sendPaymentEmail || undefined },
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
export async function getBranches({ activeOnly = false, signup = false, admin = false } = {}) {
  try {
    const params = {}
    if (activeOnly) params.activeOnly = '1'
    if (signup) params.signup = '1'
    const data = await getJson('getBranches', params, admin ? 'admin' : undefined)
    return (data && data.success && data.branches) || []
  } catch (err) {
    console.error('getBranches error', err)
    return []
  }
}

export async function saveBranch(branchData) {
  const data = await postJson('saveBranch', branchData, null, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to save branch')
  return data
}

export async function deleteBranch(id, { force = false } = {}) {
  const data = await postJson('deleteBranch', { id, force }, { id }, 'admin')
  if (!data.success) throw new Error(data.error || 'Failed to delete branch')
  return data
}

export async function setBranchActive(id, active) {
  const data = await postJson('setBranchActive', { id, active }, { id }, 'admin')
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
  }, null, 'admin')
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
