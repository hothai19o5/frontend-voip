import { useEffect } from 'react'
import { useSession } from '../features/auth/use-session'
import { sessionStore } from '../features/auth/session-store'
import { useToast } from './toast-context'

export function SessionNotifications() {
  const { notice } = useSession()
  const notify = useToast()
  useEffect(() => {
    if (!notice) return
    notify({ id: `session:${notice}`, message: notice, tone: 'info' })
    sessionStore.clearNotice(notice)
  }, [notice, notify])
  return null
}
