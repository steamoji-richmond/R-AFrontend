import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header.jsx'
import Overlays from './components/Overlays.jsx'

const Register = lazy(() => import('./pages/Register.jsx'))
const Attendance = lazy(() => import('./pages/Attendance.jsx'))
const Scanner = lazy(() => import('./pages/Scanner.jsx'))
const Admin = lazy(() => import('./pages/Admin/index.jsx'))
const PaymentReturn = lazy(() => import('./pages/PaymentReturn.jsx'))

function PageFallback() {
  return (
    <div className="panel" style={{ margin: 20, textAlign: 'center' }}>
      <div className="caption">Loading…</div>
    </div>
  )
}

function MainWithAdminClass() {
  const { pathname } = useLocation()
  return (
    <main className={pathname.startsWith('/admin') ? 'main--admin' : undefined}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/register" replace />} />
            <Route path="/register" element={<Register />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/scan/:sid" element={<Scanner />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/payment/return" element={<PaymentReturn />} />
            <Route path="*" element={<Navigate to="/register" replace />} />
          </Routes>
        </Suspense>
    </main>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <MainWithAdminClass />
      <Overlays />
    </>
  )
}
