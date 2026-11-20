import { Phone, PhoneMissed, Smartphone, Video } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { timeLabel } from '../messages/message-format'
import type { CallResult } from './call-history-context'
import { callOutcome, callTitle } from './call-format'

function duration(call: CallResult) {
  if (call.answeredAt == null) return null
  const seconds = Math.max(
    0,
    Math.floor((call.endedAt - call.answeredAt) / 1000),
  )
  if (seconds < 60) return `${seconds} giây`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours
    ? `${hours} giờ ${minutes} phút`
    : `${minutes} phút ${seconds % 60} giây`
}

export function CallActivity({
  call,
  canCall,
  redial,
}: {
  call: CallResult
  canCall: boolean
  redial: (call: CallResult) => void
}) {
  const missed = call.status === 'MISSED'
  const Icon = call.pstnPhoneNumber
    ? Smartphone
    : missed
      ? PhoneMissed
      : call.video
        ? Video
        : Phone
  const length = duration(call)
  const details = missed
    ? call.video
      ? 'Video'
      : 'Thoại'
    : call.status === 'COMPLETED' && length
      ? length
      : [callOutcome[call.status], length].filter(Boolean).join(' · ')

  return (
    <div
      className={`chat-message ${call.direction === 'OUTGOING' ? 'outgoing-message' : 'incoming-message'}`}
    >
      <div className={`call-activity${missed ? ' call-activity-missed' : ''}`}>
        <div className="call-activity-heading">
          <span className="call-activity-icon">
            <Icon size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{missed ? 'Cuộc gọi nhỡ' : callTitle(call)}</strong>
            <span>{details}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canCall}
          onClick={() => redial(call)}
        >
          Gọi lại
        </Button>
      </div>
      <div className="message-meta">
        <time dateTime={new Date(call.endedAt).toISOString()}>
          {timeLabel(call.endedAt)}
        </time>
      </div>
    </div>
  )
}
