import { useEffect, useState } from 'react'
import { Loading } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { sessionStore, type SessionCredentials } from './session-store'

export function SessionRestore({ pending }: { pending: SessionCredentials }) {
  const [attempt, setAttempt] = useState(0)
  const [failedAttempt, setFailedAttempt] = useState<number>()

  useEffect(() => {
    sessionStore.checkExpiry()
    if (sessionStore.getSnapshot().pendingSession !== pending) return

    const abort = new AbortController()
    const retry = () => setAttempt((previous) => previous + 1)
    void api
      .me(pending.accessToken, abort.signal)
      .then((user) => {
        if (abort.signal.aborted) return
        if (typeof user?.id !== 'string' || typeof user.displayName !== 'string')
          throw new Error('Hồ sơ phiên đăng nhập không hợp lệ.')
        sessionStore.confirmRestore(pending, user)
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailedAttempt(attempt)
      })
    window.addEventListener('online', retry)
    return () => {
      window.removeEventListener('online', retry)
      abort.abort()
    }
  }, [pending, attempt])

  if (failedAttempt !== attempt) {
    return <Loading label="Đang xác minh phiên đăng nhập…" />
  }

  return (
    <main className="loading-state">
      <p role="alert">Chưa xác minh được phiên đăng nhập.</p>
      <Button onClick={() => setAttempt((previous) => previous + 1)}>
        Thử lại
      </Button>
    </main>
  )
}
