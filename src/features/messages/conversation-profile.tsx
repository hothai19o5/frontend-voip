import { useEffect, useState } from 'react'
import {
  ChevronDown,
  FileText,
  Image,
  Info,
  MessageCircle,
  Phone,
  UserRound,
  Video,
  X,
} from 'lucide-react'
import { PersonAvatar } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { useSession } from '../auth/use-session'
import type { Conversation } from './message-store'
import { PresenceStatus } from '../presence/presence-status'

function ConversationPhone({ peer }: { peer: string }) {
  const { session } = useSession()
  const token = session?.accessToken
  const [label, setLabel] = useState('Đang tải số điện thoại…')

  useEffect(() => {
    if (!token) return
    const abort = new AbortController()
    void api.contactPhone(token, peer, abort.signal).then(
      ({ phoneNumber }) => {
        if (!abort.signal.aborted)
          setLabel(phoneNumber ?? 'Chưa có số điện thoại')
      },
      () => {
        if (!abort.signal.aborted) setLabel('Không tải được số điện thoại')
      },
    )
    return () => abort.abort()
  }, [peer, token])

  return <p>{label}</p>
}

export function ConversationProfile({
  conversation,
  close,
  call,
  canCall,
}: {
  conversation?: Conversation
  close: () => void
  call: (video?: boolean) => void
  canCall: boolean
}) {
  return (
    <aside
      className="conversation-profile island"
      aria-label="Thông tin người đang chat"
    >
      <div className="profile-toolbar">
        <span>Thông tin đoạn chat</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Đóng hồ sơ"
        >
          <X />
        </Button>
      </div>
      {conversation ? (
        <>
          <div className="detail-person">
            <PersonAvatar name={conversation.name} large />
            <h2>{conversation.name}</h2>
            <ConversationPhone key={conversation.peer} peer={conversation.peer} />
            <PresenceStatus
              userId={conversation.user?.id ?? conversation.peerUserId}
            />
          </div>
          <div className="profile-call-actions">
            <Button variant="ghost" disabled={!canCall} onClick={() => call()}>
              <span>
                <Phone />
              </span>
              Gọi thoại
            </Button>
            <Button
              variant="ghost"
              disabled={!canCall}
              onClick={() => call(true)}
            >
              <span>
                <Video />
              </span>
              Gọi video
            </Button>
          </div>
          <details className="profile-section" open>
            <summary>
              Thông tin người dùng
              <ChevronDown />
            </summary>
            <dl className="profile-details">
              <div>
                <dt>
                  <UserRound />
                  Tên hiển thị
                </dt>
                <dd>{conversation.name}</dd>
              </div>
              {conversation.user ? (
                <div>
                  <dt>
                    <MessageCircle />
                    Tên đăng nhập
                  </dt>
                  <dd>{conversation.user.username}</dd>
                </div>
              ) : null}
            </dl>
          </details>
          <details className="profile-section" open>
            <summary>
              Ảnh đã chia sẻ
              <ChevronDown />
            </summary>
            <div className="shared-empty">
              <Image />
              <p>Chưa có ảnh được chia sẻ.</p>
            </div>
          </details>
          <details className="profile-section">
            <summary>
              File đã chia sẻ
              <ChevronDown />
            </summary>
            <div className="shared-empty">
              <FileText />
              <p>Chưa có file được chia sẻ.</p>
            </div>
          </details>
        </>
      ) : (
        <div className="profile-placeholder">
          <Info />
          <p>Chọn một đoạn chat để xem thông tin.</p>
        </div>
      )}
    </aside>
  )
}
