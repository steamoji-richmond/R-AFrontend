import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [toast, setToast] = useState(null)
  const [success, setSuccess] = useState(null)
  const [seat, setSeat] = useState(null)
  const [password, setPassword] = useState(null) // { prompt, resolve }
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [attendUnlocked, setAttendUnlocked] = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg) => {
    const text = String(msg || 'Saved.')
    if (/^Registered/i.test(text)) {
      setSuccess(text)
      return
    }
    setToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }, [])

  const showSuccess = useCallback((msg) => setSuccess(msg || 'Success'), [])
  const closeSuccess = useCallback(() => setSuccess(null), [])

  const showSeat = useCallback((n) => setSeat(n), [])
  const closeSeat = useCallback(() => setSeat(null), [])

  const passwordDialog = useCallback((prompt) => {
    return new Promise((resolve) => {
      setPassword({ prompt: prompt || 'Enter password', resolve })
    })
  }, [])

  const resolvePassword = useCallback(
    (val) => {
      if (password && typeof password.resolve === 'function') password.resolve(val)
      setPassword(null)
    },
    [password]
  )

  const value = {
    toast,
    showToast,
    success,
    showSuccess,
    closeSuccess,
    seat,
    showSeat,
    closeSeat,
    password,
    passwordDialog,
    resolvePassword,
    adminUnlocked,
    setAdminUnlocked,
    attendUnlocked,
    setAttendUnlocked,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
