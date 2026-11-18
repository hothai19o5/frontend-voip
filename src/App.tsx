import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthPage } from './features/auth/auth-page'
import { SessionRestore } from './features/auth/session-restore'
import { useSession } from './features/auth/use-session'
import { sessionStore } from './features/auth/session-store'
import { Loading } from './components/app-ui'
import { APP_NAME } from './lib/brand'
import { ToastProvider } from './components/toast-provider'
import { SessionNotifications } from './components/session-notifications'

const ProtectedApp = lazy(() => import('./features/auth/protected-app'))
const MessagesPage = lazy(() =>
  import('./features/messages/messages-page').then((module) => ({
    default: module.MessagesPage,
  })),
)

export default function App() {
  const { session, pendingSession } = useSession()
  const currentSession = session ?? pendingSession
  useEffect(() => {
    if (!currentSession) return
    const expiresAt = Date.parse(currentSession.expiresAt)
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timer)
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) sessionStore.checkExpiry()
      else timer = setTimeout(check, Math.min(remaining, 2_147_483_647))
    }
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [currentSession])
  if (pendingSession) return <SessionRestore pending={pendingSession} />

  return (
    <ToastProvider>
      <SessionNotifications />
      <BrowserRouter>
        <Suspense fallback={<Loading label={`Đang mở ${APP_NAME}…`} />}>
          <Routes>
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route
              path="/register"
              element={<AuthPage key="register" register />}
            />
            <Route element={<ProtectedApp />}>
              <Route path="/messages" element={<MessagesPage />} />
            </Route>
            <Route
              path="*"
              element={
                <Navigate to={session ? '/messages' : '/login'} replace />
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  )
}
