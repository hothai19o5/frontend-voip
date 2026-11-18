import { useContext } from 'react'
import { PresenceContext } from './presence-context'

export function PresenceStatus({
  userId,
  dot = false,
}: {
  userId?: string | null
  dot?: boolean
}) {
  const onlineUsers = useContext(PresenceContext)
  if (!userId) return null
  const online = onlineUsers?.has(userId)
  const status =
    online === undefined ? 'unknown' : online ? 'online' : 'offline'
  const label =
    online === undefined ? 'Chưa rõ trạng thái' : online ? 'Online' : 'Offline'
  if (dot && online === undefined) return null

  return (
    <span
      className={dot ? 'presence-badge presence-badge-dot' : 'presence-badge'}
      data-presence={status}
      title={dot ? label : undefined}
    >
      <span className="presence-indicator" aria-hidden="true" />
      <span className={dot ? 'sr-only' : undefined}>{label}</span>
    </span>
  )
}
