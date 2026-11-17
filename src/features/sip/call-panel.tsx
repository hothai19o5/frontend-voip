import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Play,
  Video,
  VideoOff,
} from 'lucide-react'
import { Brand, PersonAvatar } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import { useSip } from './sip-context'
import { callLabels } from './types'

function Duration({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  const seconds = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0
  return (
    <span className="call-duration">
      {String(Math.floor(seconds / 60)).padStart(2, '0')}:
      {String(seconds % 60).padStart(2, '0')}
    </span>
  )
}

export function CallPanel({ children }: { children: ReactNode }) {
  const sip = useSip()
  const { state } = sip
  const peer = state.peer.replace(/^sip:/, '').split('@')[0]
  const name = sip.peerName || peer
  const video =
    state.call === 'active' && (state.hasVideo || state.offeredVideo)
  const pending = state.call === 'answering' || state.call === 'ending'
  return (
    <section
      className={`call-panel ${video ? 'with-video' : ''}`}
      hidden={state.call === 'idle'}
      aria-label="Cuộc gọi hiện tại"
    >
      <div className="call-panel-header">
        <Brand small />
        <span>{state.offeredVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}</span>
      </div>
      <div className="call-person">
        <PersonAvatar name={name || '?'} large />
        <h2>{name}</h2>
        <p>Máy nhánh {peer}</p>
        <div className="call-indicator" role="status" aria-live="polite">
          <span className="status-dot" />
          {callLabels[state.call]}
          {state.call === 'active' ? <Duration since={sip.startedAt} /> : null}
        </div>
      </div>
      {children}
      {state.call === 'incoming' ? (
        <div className="incoming-actions">
          <Button
            variant="destructive"
            className="danger-action"
            onClick={() => void sip.hangup()}
          >
            <PhoneOff />
            Từ chối
          </Button>
          <Button
            className="answer-action"
            onClick={() => void sip.answer(false)}
          >
            <Phone />
            Trả lời
          </Button>
          {state.offeredVideo ? (
            <Button
              className="primary-action"
              onClick={() => void sip.answer(true)}
            >
              <Video />
              Bật video
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="call-controls">
            <Button
              variant="secondary"
              disabled={state.call !== 'active'}
              onClick={() => void sip.toggle('audio')}
              aria-pressed={state.muted}
            >
              {state.muted ? <MicOff /> : <Mic />}
              {state.muted ? 'Bật mic' : 'Tắt mic'}
            </Button>
            {state.hasVideo ? (
              <Button
                variant="secondary"
                disabled={state.call !== 'active'}
                onClick={() => void sip.toggle('video')}
                aria-pressed={state.cameraOff}
              >
                {state.cameraOff ? <VideoOff /> : <Video />}
                {state.cameraOff ? 'Bật camera' : 'Tắt camera'}
              </Button>
            ) : null}
            {state.call === 'active' ? (
              <Button
                variant="ghost"
                onClick={() => void sip.replay()}
                title="Phát lại âm thanh và video nếu trình duyệt chặn tự phát"
              >
                <Play />
                Phát lại
              </Button>
            ) : null}
          </div>
          <Button
            variant="destructive"
            className="danger-action end-call"
            disabled={pending}
            onClick={() => void sip.hangup()}
          >
            <PhoneOff />
            {state.call === 'outgoing' ? 'Hủy cuộc gọi' : 'Kết thúc cuộc gọi'}
          </Button>
        </>
      )}
    </section>
  )
}
