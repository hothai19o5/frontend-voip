import { useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import { LogOut, UserRound, ChevronUp } from 'lucide-react'
import { PersonAvatar } from './app-ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { useSession } from '../features/auth/use-session'
import { sessionStore } from '../features/auth/session-store'
import { api } from '../lib/api'

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { session } = useSession()
  const [profileOpen, setProfileOpen] = useState(false)
  if (!session) return null
  const user = session.user
  function logout() {
    const token = session!.accessToken
    sessionStore.end('Bạn đã đăng xuất.', token)
    void api.logout(token).catch(() => {
      if (!sessionStore.getSnapshot().session)
        sessionStore.end(
          'Đã đăng xuất trên thiết bị này. Máy chủ chưa xác nhận thu hồi phiên; phiên sẽ tự hết hạn.',
        )
    })
  }
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="account-trigger"
          aria-label="Menu tài khoản"
          title={collapsed ? user.displayName : undefined}
        >
          <PersonAvatar name={user.displayName} />
          <span className="account-name">
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </span>
          <ChevronUp className="account-chevron" size={15} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="account-menu"
            side="right"
            align="end"
            sideOffset={12}
            collisionPadding={12}
          >
            <DropdownMenu.Label className="account-menu-heading">
              Tài khoản
            </DropdownMenu.Label>
            <DropdownMenu.Item
              className="account-menu-item"
              onSelect={() => setProfileOpen(true)}
            >
              <UserRound />
              Thông tin tài khoản
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="account-menu-item menu-danger"
              onSelect={logout}
            >
              <LogOut />
              Đăng xuất
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="account-dialog">
          <DialogHeader>
            <DialogTitle>Thông tin tài khoản</DialogTitle>
            <DialogDescription>Thông tin cá nhân của bạn.</DialogDescription>
          </DialogHeader>
          <div className="account-profile">
            <PersonAvatar name={user.displayName} large />
            <h2>{user.displayName}</h2>
          </div>
          <dl className="account-details">
            <div>
              <dt>Tên đăng nhập</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            {user.sip ? (
              <div>
                <dt>Máy nhánh</dt>
                <dd>{user.sip.extension}</dd>
              </div>
            ) : null}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  )
}
