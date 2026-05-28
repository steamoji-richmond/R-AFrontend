const ADMIN_KEY = 'ws_admin_key'
const ATTEND_KEY = 'ws_attend_key'

export function setAdminKey(key) {
  if (key) sessionStorage.setItem(ADMIN_KEY, key)
  else sessionStorage.removeItem(ADMIN_KEY)
}

export function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY) || ''
}

export function setAttendKey(key) {
  if (key) sessionStorage.setItem(ATTEND_KEY, key)
  else sessionStorage.removeItem(ATTEND_KEY)
}

export function getAttendKey() {
  return sessionStorage.getItem(ATTEND_KEY) || ''
}
