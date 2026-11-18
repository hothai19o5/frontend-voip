import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../../lib/api'
import { PresenceContext } from './presence-context'

const HEARTBEAT_INTERVAL = 5000

export function PresenceProvider({
  token,
  children,
}: {
  token: string
  children: ReactNode
}) {
  const [onlineUsers, setOnlineUsers] = useState<ReadonlySet<string> | null>(
    null,
  )

  useEffect(() => {
    let pending: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false

    async function heartbeat() {
      if (disposed || pending || !navigator.onLine) return
      clearTimeout(timer)
      const request = new AbortController()
      pending = request
      try {
        const snapshot = await api.presenceHeartbeat(
          token,
          AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
        )
        if (request.signal.aborted) return
        const ids = snapshot.onlineUserIds
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
          setOnlineUsers(null)
          return
        }
        const next = new Set(ids)
        setOnlineUsers((current) =>
          current?.size === next.size && ids.every((id) => current.has(id))
            ? current
            : next,
        )
      } catch {
        if (!request.signal.aborted) setOnlineUsers(null)
      } finally {
        if (pending === request) {
          pending = undefined
          timer = setTimeout(heartbeat, HEARTBEAT_INTERVAL)
        }
      }
    }

    function disconnect() {
      clearTimeout(timer)
      pending?.abort()
      pending = undefined
    }

    function offline() {
      disconnect()
      setOnlineUsers(null)
    }

    function visible() {
      if (document.visibilityState === 'visible') void heartbeat()
    }

    window.addEventListener('online', heartbeat)
    window.addEventListener('offline', offline)
    window.addEventListener('pageshow', heartbeat)
    document.addEventListener('visibilitychange', visible)
    void heartbeat()
    return () => {
      disposed = true
      disconnect()
      window.removeEventListener('online', heartbeat)
      window.removeEventListener('offline', offline)
      window.removeEventListener('pageshow', heartbeat)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [token])

  return (
    <PresenceContext.Provider value={onlineUsers}>
      {children}
    </PresenceContext.Provider>
  )
}
