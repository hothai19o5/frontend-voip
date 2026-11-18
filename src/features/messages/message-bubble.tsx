import { Check, CircleAlert, Clock3 } from 'lucide-react'
import type { ChatMessage } from './message-store'
import { timeLabel } from './message-format'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const outgoing = message.direction === 'outgoing'
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
      className={`chat-message ${outgoing ? 'outgoing-message' : 'incoming-message'}`}
    >
      <div className="message-body">{message.body}</div>
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
