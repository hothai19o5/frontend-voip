import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { Field, Loading, PersonAvatar } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog'
import { useSession } from '../auth/use-session'
import { useDirectory } from './use-directory'
import type { DirectoryUser } from '../../lib/contracts'
import { PresenceStatus } from '../presence/presence-status'

export function PeopleList({
  select,
  action = 'message',
  disabled = false,
}: {
  select: (user: DirectoryUser) => void
  action?: 'message' | 'call'
  disabled?: boolean
}) {
  const { session } = useSession()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ q: '', page: 0 })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((current) =>
          current.q === search.trim() ? current : { q: search.trim(), page: 0 },
        ),
      300,
    )
    return () => clearTimeout(timer)
  }, [search])
  const { data, failed, loading } = useDirectory(
    session!.accessToken,
    query.q,
    query.page,
    revision,
  )
  return (
    <>
      <div className="people-search">
        <Field
          id="search-users"
          label="Tìm người dùng"
          type="search"
          icon={<Search />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tên hoặc tên đăng nhập"
          maxLength={100}
          autoComplete="off"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Tải lại danh sách"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw className={loading ? 'spin' : ''} />
        </Button>
      </div>
      <div className="people-results">
        {loading ? (
          <Loading label="Đang tìm người dùng…" />
        ) : failed ? (
          <div className="empty-state">
            <Users />
            <h3>Chưa tải được danh sách</h3>
            <Button
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Thử lại
            </Button>
          </div>
        ) : data?.content.length ? (
          <ul className="people-list">
            {data.content.map((user) => {
              const unavailable =
                !user.sip ||
                (action === 'call' &&
                  (user.sip.provisioningStatus !== 'READY' ||
                    !user.sip.extensionPresent))
              return (
                <li key={user.id}>
                  <button
                    className="person-option"
                    onClick={() => select(user)}
                    disabled={
                      disabled || unavailable || user.status !== 'ACTIVE'
                    }
                    aria-label={
                      action === 'call' ? `Gọi ${user.displayName}` : undefined
                    }
                  >
                    <PersonAvatar name={user.displayName} />
                    <span>
                      <strong>{user.displayName}</strong>
                      <small className="presence-details">
                        <span>@{user.username}</span>
                        <PresenceStatus userId={user.id} />
                      </small>
                    </span>
                    {user.status === 'BLOCKED' ? (
                      <small>Đã khóa</small>
                    ) : unavailable ? (
                      <small>Chưa thể liên lạc</small>
                    ) : action === 'call' ? (
                      <Phone size={18} />
                    ) : (
                      <MessageCircle size={18} />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="empty-state">
            <Search />
            <h3>
              {query.q
                ? 'Không tìm thấy người dùng'
                : 'Chưa có người dùng khác'}
            </h3>
            <p>
              {query.q
                ? 'Thử tìm bằng tên khác.'
                : 'Người dùng mới sẽ xuất hiện sau khi đăng ký.'}
            </p>
          </div>
        )}
      </div>
      <div className="people-pagination">
        <span>{data?.totalElements ?? 0} người dùng</span>
        <div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Trang trước"
            disabled={loading || query.page === 0}
            onClick={() =>
              setQuery((current) => ({ ...current, page: current.page - 1 }))
            }
          >
            <ArrowLeft />
          </Button>
          <span>Trang {query.page + 1}</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Trang sau"
            disabled={loading || !data?.hasNext}
            onClick={() =>
              setQuery((current) => ({ ...current, page: current.page + 1 }))
            }
          >
            <ArrowRight />
          </Button>
        </div>
      </div>
    </>
  )
}

export function PeoplePicker({
  open,
  onOpenChange,
  select,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  select: (user: DirectoryUser) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="people-dialog">
        <DialogHeader>
          <DialogTitle>Hội thoại mới</DialogTitle>
          <DialogDescription>
            Chọn người để bắt đầu nhắn tin hoặc gọi điện.
          </DialogDescription>
        </DialogHeader>
        {open ? <PeopleList select={select} /> : null}
      </DialogContent>
    </Dialog>
  )
}
