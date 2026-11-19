import { Check, CircleAlert, Clock3 } from 'lucide-react'
import type { ChatMessage } from './message-store'
import { timeLabel } from './message-format'
import { parseSticker, isEmojiOnly } from './message-content'
import { StickerArt } from './sticker-art'
import { AttachmentCard } from './attachment-card'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const outgoing = message.direction === 'outgoing'
  const attachment = message.attachment
  const sticker = attachment ? null : parseSticker(message.body)
  const expressive = !attachment && !sticker && isEmojiOnly(message.body)
  const label =
    message.status === 'pending'
      ? 'Đang gửi'
      : message.status === 'failed'
        ? 'Gửi thất bại'
        : message.status === 'unknown'
          ? 'Chưa rõ kết quả gửi'
          : 'Đã gửi tới dịch vụ'
  return (
    <div
      className={`chat-message ${outgoing ? 'outgoing-message' : 'incoming-message'} ${sticker ? 'sticker-message' : expressive ? 'emoji-message' : ''}`}
    >
      <div className="message-body">
        {attachment ? (
          <AttachmentCard id={message.id} attachment={attachment} />
        ) : sticker ? (
          <StickerArt sticker={sticker} />
        ) : (
          message.body
        )}
      </div>
      <div className="message-meta">
        <time dateTime={new Date(message.time).toISOString()}>
          {timeLabel(message.time)}
        </time>
        {outgoing ? (
          <span
            className={`message-delivery delivery-${message.status}`}
            aria-label={label}
            title={label}
          >
            {message.status === 'pending' ? (
              <Clock3 size={12} />
            ) : message.status === 'failed' || message.status === 'unknown' ? (
              <CircleAlert size={12} />
            ) : (
              <Check size={13} />
            )}
          </span>
        ) : null}
        {message.historyState === 'failed' ? (
          <span>Chưa lưu lịch sử</span>
        ) : null}
      </div>
    </div>
  )
}
