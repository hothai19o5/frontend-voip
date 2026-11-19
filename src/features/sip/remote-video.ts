type VideoCounters = Pick<
  RTCInboundRtpStreamStats,
  'bytesReceived' | 'packetsReceived' | 'framesReceived' | 'framesDecoded'
> &
  Pick<RTCOutboundRtpStreamStats, 'bytesSent'>

type VideoStat = VideoCounters & {
  type: RTCStatsType
  kind?: string
  mediaType?: string
  isRemote?: boolean
  codecId?: string
  mimeType?: string
}

export type VideoDiagnostics = Partial<ReturnType<typeof videoSnapshot>> & {
  bytesPerSecond?: number | null
  playbackError?: string
  statsError?: string
}

type RemoteVideoOptions = {
  peer: RTCPeerConnection
  video: HTMLVideoElement | null
  onDiagnostics: (info: VideoDiagnostics) => void
  createStream?: (tracks: MediaStreamTrack[]) => MediaStream
}

// Only observe negotiated media here. Do not change SDP, codecs or SIP.js handlers.
export function videoSnapshot(
  peer: RTCPeerConnection,
  report: ReadonlyMap<string, VideoStat>,
  video: HTMLVideoElement | null,
) {
  const entries = [...report.values()]
  const incoming = entries.filter(
    (stat) =>
      stat.type === 'inbound-rtp' &&
      !stat.isRemote &&
      (stat.kind || stat.mediaType) === 'video',
  )
  const outgoing = entries.filter(
    (stat) =>
      stat.type === 'outbound-rtp' &&
      !stat.isRemote &&
      (stat.kind || stat.mediaType) === 'video',
  )
  const sum = (stats: VideoStat[], field: keyof VideoCounters) =>
    stats.reduce((total, stat) => total + (stat[field] || 0), 0)
  const optionalSum = (field: keyof VideoCounters) =>
    incoming.some((stat) => typeof stat[field] === 'number')
      ? sum(incoming, field)
      : null
  const directions = (peer.getTransceivers?.() || [])
    .filter(
      (transceiver) =>
        transceiver.receiver?.track?.kind === 'video' ||
        transceiver.sender?.track?.kind === 'video',
    )
    .map((transceiver) => transceiver.currentDirection || 'chưa thương lượng')
  const tracks = (peer.getReceivers?.() || [])
    .map((receiver) => receiver.track)
    .filter((track) => track?.kind === 'video')
  const codecs = [
    ...new Set(
      incoming
        .map((stat) => stat.codecId && report.get(stat.codecId)?.mimeType)
        .filter(Boolean),
    ),
  ]
  return {
    connection: peer.connectionState || 'unknown',
    ice: peer.iceConnectionState || 'unknown',
    directions: [...new Set(directions)].join(', ') || 'không có video',
    tracks:
      tracks
        .map((track) => `${track.readyState}${track.muted ? ' / muted' : ''}`)
        .join(', ') || 'chưa có track',
    codec: codecs.join(', ') || 'chưa có dữ liệu',
    bytesReceived: sum(incoming, 'bytesReceived'),
    packetsReceived: sum(incoming, 'packetsReceived'),
    framesReceived: optionalSum('framesReceived'),
    framesDecoded: optionalSum('framesDecoded'),
    bytesSent: sum(outgoing, 'bytesSent'),
    width: video?.videoWidth || 0,
    height: video?.videoHeight || 0,
    paused: video?.paused ?? true,
  }
}

export function videoDiagnosis(info: VideoDiagnostics) {
  if (info.statsError) return `Không đọc được thống kê: ${info.statsError}`
  if (info.playbackError)
    return `Chưa phát được video: ${info.playbackError}. Thử nút Phát lại video nhận.`
  if (!/(sendrecv|recvonly)/.test(info.directions ?? ''))
    return 'Web chưa có chiều nhận video được thương lượng. Cần kiểm tra SDP hai call leg.'
  if (!info.bytesReceived)
    return 'Web đang chờ dữ liệu video. Kiểm tra chiều gửi của Linphone và media qua FreeSWITCH.'
  if (info.framesDecoded === 0)
    return 'Đã nhận byte video nhưng chưa giải mã được khung hình. Cần đối chiếu codec, keyframe và mất gói.'
  if (!info.width || !info.height || info.paused)
    return 'Đã nhận dữ liệu video nhưng phần tử phát chưa hiển thị hình. Thử Phát lại video nhận.'
  if (info.bytesPerSecond === 0)
    return 'Đã có hình video; byte nhận chưa tăng trong lần đo gần nhất.'
  return 'Web đã nhận dữ liệu và phần tử video đã có kích thước hình.'
}

function diagnosticError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && error.message)
    return String(error.message)
  return String(error)
}

export function observeRemoteVideo({
  peer,
  video,
  onDiagnostics,
  createStream = (tracks) => new MediaStream(tracks),
}: RemoteVideoOptions) {
  let stopped = false
  let previous: { time: number; bytes: number } | undefined
  let sampling = false
  let playbackError = ''
  const cleanups: (() => void)[] = []
  const watchedTracks = new Set<MediaStreamTrack>()
  const stream = createStream([])

  function listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler)
    cleanups.push(() => target.removeEventListener(event, handler))
  }

  async function play() {
    if (stopped || !video || !stream.getVideoTracks().length) return
    if (video.srcObject !== stream) video.srcObject = stream
    video.muted = true
    try {
      await video.play()
      if (!stopped) playbackError = ''
    } catch (error) {
      if (!stopped) playbackError = diagnosticError(error)
    }
    void sample()
  }

  function syncTracks() {
    if (stopped) return
    const tracks = peer
      .getReceivers()
      .map((receiver) => receiver.track)
      .filter(
        (track) => track?.kind === 'video' && track.readyState !== 'ended',
      )
    for (const track of stream.getTracks())
      if (!tracks.includes(track)) stream.removeTrack(track)
    for (const track of tracks) {
      if (!stream.getTracks().includes(track)) stream.addTrack(track)
      if (!watchedTracks.has(track)) {
        watchedTracks.add(track)
        listen(track, 'unmute', () => {
          void play()
        })
        listen(track, 'mute', () => {
          void sample()
        })
        listen(track, 'ended', syncTracks)
      }
    }
    void play()
  }

  async function sample() {
    if (stopped || sampling) return
    sampling = true
    try {
      const report = await peer.getStats()
      if (stopped) return
      const info = videoSnapshot(peer, report, video)
      const now = Date.now()
      const elapsed = previous ? now - previous.time : 0
      const bytesPerSecond =
        previous && elapsed > 0 && info.bytesReceived >= previous.bytes
          ? Math.round(((info.bytesReceived - previous.bytes) * 1000) / elapsed)
          : null
      previous = { time: now, bytes: info.bytesReceived }
      onDiagnostics({ ...info, bytesPerSecond, playbackError, statsError: '' })
    } catch (error) {
      if (!stopped) onDiagnostics({ statsError: diagnosticError(error) })
    } finally {
      sampling = false
    }
  }

  // addEventListener preserves SIP.js's ontrack and its remote audio handling.
  listen(peer, 'track', syncTracks)
  listen(peer, 'signalingstatechange', syncTracks)
  listen(peer, 'connectionstatechange', () => {
    void sample()
  })
  if (video) {
    listen(video, 'loadedmetadata', () => {
      void play()
    })
    listen(video, 'resize', () => {
      void sample()
    })
    listen(video, 'playing', () => {
      void sample()
    })
    listen(video, 'error', () => {
      playbackError = video.error?.message || 'Lỗi phần tử video'
      void sample()
    })
  }
  syncTracks()
  void sample()
  const timer = setInterval(() => {
    void sample()
  }, 1000)

  return {
    peer,
    play,
    stop() {
      stopped = true
      clearInterval(timer)
      cleanups.forEach((cleanup) => cleanup())
      // Receiver tracks belong to SIP.js. Ending playback must not stop audio.
      if (video?.srcObject === stream) video.srcObject = null
    },
  }
}
