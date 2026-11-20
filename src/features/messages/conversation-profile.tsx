import {
  ChevronDown,
  FileText,
  Image,
  Info,
  MessageCircle,
  Phone,
  Smartphone,
  UserRound,
  Video,
  X,
} from 'lucide-react'
import { PersonAvatar } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import type { ChatMessage, Conversation } from './message-store'
import { AttachmentCard } from './attachment-card'
import { isImageAttachment } from './message-store'
import { PresenceStatus } from '../presence/presence-status'

function SharedAttachments({
  messages,
  images,
}: {
  messages: ChatMessage[]
  images: boolean
}) {
  const entries = messages
    .toReversed()
    .flatMap(({ id, attachment }) =>
      attachment && isImageAttachment(attachment) === images
        ? [{ id, attachment }]
        : [],
    )
  if (!entries.length)
    return (
      <div className="shared-empty">
        {images ? <Image /> : <FileText />}
        <p>
          {images ? 'Chưa có ảnh được chia sẻ.' : 'Chưa có file được chia sẻ.'}
        </p>
      </div>
    )
  return (
    <ul className="shared-attachments">
      {entries.map(({ id, attachment }) => (
        <li key={id}>
          <AttachmentCard id={id} attachment={attachment} preview={false} />
        </li>
      ))}
    </ul>
  )
}

export function ConversationProfile({
  conversation,
  close,
  call,
  canCall,
  phoneLabel,
  callByPhone,
  canCallByPhone,
}: {
  conversation?: Conversation
  close: () => void
  call: (video?: boolean) => void
  canCall: boolean
  phoneLabel: string
  callByPhone?: () => void
  canCallByPhone: boolean
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
            <p>{phoneLabel}</p>
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
            {callByPhone ? (
              <Button
                variant="ghost"
                aria-label="Gọi qua số điện thoại"
                disabled={!canCallByPhone}
                onClick={callByPhone}
              >
                <span>
                  <Smartphone />
                </span>
                Gọi qua số
              </Button>
            ) : null}
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
            <SharedAttachments messages={conversation.messages} images />
          </details>
          <details className="profile-section">
            <summary>
              File đã chia sẻ
              <ChevronDown />
            </summary>
            <SharedAttachments
              messages={conversation.messages}
              images={false}
            />
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
