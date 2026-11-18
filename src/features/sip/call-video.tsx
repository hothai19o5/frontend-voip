import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

// SIP.js always keeps its original elements in the opener. Views only share
// their streams; unmounting a view never stops or clones the owner's tracks.
export function CallVideo({
  remote,
  local,
  visible,
}: {
  remote: RefObject<HTMLVideoElement | null>
  local: RefObject<HTMLVideoElement | null>
  visible: boolean
}) {
  const remoteView = useRef<HTMLVideoElement>(null)
  const localView = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const pairs = [
      [remote.current, remoteView.current],
      [local.current, localView.current],
    ]
    const sync = () => {
      for (const [source, view] of pairs) {
        if (!view || view.srcObject === source?.srcObject) continue
        view.srcObject = source?.srcObject ?? null
        if (view.srcObject) void view.play().catch(() => {})
      }
    }
    sync()
    for (const [source] of pairs)
      source?.addEventListener('loadedmetadata', sync)
    // Also detects a replaced stream and late/renegotiated tracks.
    const timer = window.setInterval(sync, 250)
    return () => {
      window.clearInterval(timer)
      for (const [source, view] of pairs) {
        source?.removeEventListener('loadedmetadata', sync)
        if (view) view.srcObject = null
      }
    }
  }, [remote, local])
  return (
    <div
      className={`call-video-stage ${visible ? 'is-visible' : ''}`}
      aria-hidden={!visible}
    >
      <video
        ref={remoteView}
        autoPlay
        playsInline
        muted
        className="remote-video"
        aria-label="Video người gọi"
      />
      <video
        ref={localView}
        autoPlay
        playsInline
        muted
        className="local-video"
        aria-label="Video của bạn"
      />
    </div>
  )
}
