import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { MessageCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Brand } from './app-ui'
import { Button } from './ui/button'
import { AccountMenu } from './account-menu'
import { useToast } from './toast-context'
import { useSip } from '../features/sip/sip-context'
import { useMessages } from '../features/messages/message-context'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(true)
  const { state, error, retry, dismissError } = useSip()
  const notify = useToast()
  const wasRegistered = useRef(false)
  const { conversations } = useMessages()
  const unread = Object.values(conversations).reduce(
    (total, conversation) => total + conversation.unread,
    0,
  )

  useEffect(() => {
    if (!error) return
    const message = /^SIP 480/.test(error)
      ? 'Người nhận hiện không thể liên lạc.'
      : /^SIP 486/.test(error)
        ? 'Người nhận đang bận.'
        : /^SIP 603/.test(error)
          ? 'Cuộc gọi đã bị từ chối.'
          : error
    if (!/^SIP 487/.test(error))
      notify({
        id: `communication:${error}`,
        message,
        tone: 'error',
        action:
          state.call === 'idle' && !/^SIP /.test(error)
            ? { label: 'Thử lại', onClick: retry }
            : undefined,
      })
    dismissError()
  }, [error, state.call, retry, dismissError, notify])
  useEffect(() => {
    if (state.connection === 'registered') wasRegistered.current = true
    if (state.connection === 'disconnected' && wasRegistered.current) {
      wasRegistered.current = false
      notify({
        id: 'connection-lost',
        message: 'Kết nối liên lạc bị gián đoạn.',
        tone: 'error',
        action: { label: 'Kết nối lại', onClick: retry },
      })
    }
  }, [state.connection, retry, notify])
  useEffect(() => {
    const reconnect = () => {
      if (state.connection === 'disconnected') retry()
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [state.connection, retry])

  return (
    <div className={`app-screen ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar" aria-label="Thanh bên">
        <div className="sidebar-brand">
          <Brand small />
        </div>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <NavLink
            to="/messages"
            aria-label="Đoạn chat"
            title={collapsed ? 'Đoạn chat' : undefined}
          >
            <MessageCircle />
            <span className="sidebar-label">Đoạn chat</span>
            {unread ? (
              <span className="nav-unread">{unread > 99 ? '99+' : unread}</span>
            ) : null}
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <AccountMenu collapsed={collapsed} />
          <Button
            variant="ghost"
            className="sidebar-toggle"
            aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span className="sidebar-label">Thu gọn sidebar</span>
          </Button>
        </div>
      </aside>
      <div className="app-workspace">
        <Outlet />
      </div>
    </div>
  )
}
