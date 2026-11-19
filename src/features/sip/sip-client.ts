import { Messager, UserAgent } from 'sip.js'
import type {
  Core,
  Invitation,
  Session,
  SessionDescriptionHandler,
  Web,
} from 'sip.js'
import { SessionManager } from 'sip.js/lib/platform/web/index.js'
import { observeRemoteVideo } from './remote-video.ts'
import { createLocalId } from '../../lib/local-id.ts'
import type { CallResult, CallStatus } from '../calls/call-history-context'
import type { MessageEvent } from '../messages/message-store'
import type { SipState } from './types'

export const INITIAL_STATE: SipState = {
  connection: 'disconnected',
  call: 'idle',
  peer: '',
  offeredVideo: false,
  hasVideo: false,
  muted: false,
  cameraOff: false,
  videoDiagnostics: null,
}

type SipMedia = {
  remoteAudio: HTMLAudioElement | null
  remoteVideo: HTMLVideoElement | null
  localVideo: HTMLVideoElement | null
}

type SipClientOptions = {
  media: SipMedia
  onState: (state: SipState) => void
  onMessage: (message: MessageEvent) => void
  onError: (error: unknown) => void
  onCallResult?: (result: CallResult) => void
}

type SipDependencies = {
  SessionManager?: typeof SessionManager
  Messager?: typeof Messager
}

type SipConnection = {
  server: string
  domain: string
  extension: string
  password: string
  displayName?: string
}

type PendingCall = Omit<CallResult, 'endedAt' | 'status' | 'name'> & {
  name?: string
  status?: CallStatus
  response?: number
  answering?: boolean
  rang?: boolean
}

type PendingMessage = {
  timer: ReturnType<typeof setTimeout>
  finish: (error?: unknown) => void
}

export function sipAddress(value: string, domain: string) {
  const address = value.trim()
  if (!address || /[\s<>]/.test(address))
    throw new Error('Extension hoặc SIP URI không hợp lệ.')
  const uri = UserAgent.makeURI(
    address.startsWith('sip:') ? address : `sip:${address}@${domain}`,
  )
  if (!uri?.user) throw new Error('Extension hoặc SIP URI không hợp lệ.')
  return uri
}

export function offersVideo(sdp = '') {
  return /^m=video\s+(?!0(?:\s|$))\d+/m.test(sdp)
}

function responseError(response: Core.IncomingResponse) {
  return new Error(
    `SIP ${response.message.statusCode}: ${response.message.reasonPhrase || 'Yêu cầu bị từ chối'}`,
  )
}

function incomingCall(session: Invitation, domain: string): PendingCall {
  const sipId = session.request.callId
  const remote = session.remoteIdentity.uri
  // A From URI can include the PBX signaling port while contacts use its AoR.
  const peer =
    remote.port != null && remote.host === domain.toLowerCase()
      ? `${remote.scheme}:${remote.aor}`
      : remote.toString()
  return {
    id:
      typeof sipId === 'string' && sipId.length <= 255 && /^[!-~]+$/.test(sipId)
        ? sipId
        : createLocalId(),
    direction: 'INCOMING',
    peer,
    name: session.remoteIdentity.displayName,
    video: offersVideo(session.request.body),
    startedAt: Date.now(),
    answeredAt: null,
  }
}

function outcome(call: PendingCall): CallStatus {
  if (call.status) return call.status
  if (call.answeredAt !== null) return 'COMPLETED'
  if (call.direction === 'INCOMING') return call.answering ? 'FAILED' : 'MISSED'
  switch (call.response) {
    case 486:
    case 600:
      return 'BUSY'
    case 603:
      return 'DECLINED'
    case 408:
      return 'UNANSWERED'
    case 480:
    case 487:
      return call.rang ? 'UNANSWERED' : 'FAILED'
    default:
      return 'FAILED'
  }
}

// The SIP lifetime is independent from React renders. Injectable dependencies let
// tests exercise failure paths without a live PBX or real credentials.
export class SipClient {
  state: SipState = { ...INITIAL_STATE }
  private readonly Manager: typeof SessionManager
  private readonly Messager: typeof Messager
  private readonly media: SipMedia
  private readonly onState: SipClientOptions['onState']
  private readonly onMessage: SipClientOptions['onMessage']
  private readonly onError: SipClientOptions['onError']
  private readonly onCallResult: NonNullable<SipClientOptions['onCallResult']>
  private readonly pendingMessages = new Map<string, PendingMessage>()
  private session: Session | null = null
  private callRecord: PendingCall | null = null
  private manager: SessionManager | null = null
  private remoteVideoObserver: ReturnType<typeof observeRemoteVideo> | null =
    null
  private beforeUnload: (() => void) | null = null
  private callPending = false
  private generation = 0
  private stopping = Promise.resolve()
  private domain = ''
  private aor = ''

  constructor(
    {
      media,
      onState,
      onMessage,
      onError,
      onCallResult = () => {},
    }: SipClientOptions,
    dependencies: SipDependencies = {},
  ) {
    this.Manager = dependencies.SessionManager || SessionManager
    this.Messager = dependencies.Messager || Messager
    this.media = media
    this.onState = onState
    this.onMessage = onMessage
    this.onError = onError
    this.onCallResult = onCallResult
  }

  private update(patch: Partial<SipState>) {
    this.state = { ...this.state, ...patch }
    this.onState(this.state)
  }

  private clearCall() {
    this.remoteVideoObserver?.stop()
    this.remoteVideoObserver = null
    this.session = null
    this.update({ ...INITIAL_STATE, connection: this.state.connection })
    for (const element of Object.values(this.media)) {
      if (element) {
        const stream = element.srcObject
        if (stream && 'getTracks' in stream)
          stream.getTracks().forEach((track) => track.stop())
        element.srcObject = null
      }
    }
  }

  private finishCall(status?: CallStatus) {
    const call = this.callRecord
    if (!call) return
    this.callRecord = null
    if (status && !call.status) call.status = status
    const endedAt = Math.max(Date.now(), call.answeredAt ?? call.startedAt)
    // SIP.js transitions to Terminated before invoking the INVITE rejection
    // delegate. Read its final response after both callbacks have run.
    queueMicrotask(() => this.reportCall(call, endedAt))
  }

  private reportCall(call: PendingCall, endedAt: number) {
    this.onCallResult({
      id: call.id,
      direction: call.direction,
      status: outcome(call),
      peer: call.peer,
      name: call.name?.replace(/\s+/g, ' ').trim().slice(0, 255) || null,
      video: call.video,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt,
      ...(call.dialedPhoneNumber
        ? { dialedPhoneNumber: call.dialedPhoneNumber }
        : {}),
    })
  }

  private bindRemoteVideo(
    session: Session,
    handler:
      SessionDescriptionHandler | undefined = session.sessionDescriptionHandler,
  ) {
    // SessionManager uses the web handler unless given a custom factory.
    const peer = (handler as Web.SessionDescriptionHandler | undefined)
      ?.peerConnection
    if (
      !peer ||
      this.session !== session ||
      this.remoteVideoObserver?.peer === peer
    )
      return
    this.remoteVideoObserver?.stop()
    this.remoteVideoObserver = observeRemoteVideo({
      peer,
      video: this.media.remoteVideo,
      onDiagnostics: (info) => {
        if (this.session === session)
          this.update({
            videoDiagnostics: { ...this.state.videoDiagnostics, ...info },
          })
      },
    })
  }

  async replayRemoteVideo() {
    if (this.remoteVideoObserver) await this.remoteVideoObserver.play()
  }

  async connect({
    server,
    domain,
    extension,
    password,
    displayName,
  }: SipConnection) {
    const url = new URL(server)
    const localWs =
      url.protocol === 'ws:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'wss:' && !localWs)
      throw new Error('Dùng WSS với chứng chỉ TLS được trình duyệt tin cậy.')
    const aor = sipAddress(extension, domain).toString()
    if (!password) throw new Error('Nhập SIP password.')
    const previousStop = this.disconnect()
    const generation = this.generation
    await previousStop
    if (generation !== this.generation) return
    this.domain = domain
    this.aor = aor
    const current = () => this.manager === manager
    const manager: SessionManager = new this.Manager(server, {
      aor,
      // SessionManager's anonymous beforeunload handler calls stop() again if
      // a previous logout is still stopping. Own this through disconnect's
      // serialized cleanup and remove it as soon as the manager is retired.
      autoStop: false,
      maxSimultaneousSessions: 1,
      reconnectionAttempts: 0,
      media: {
        constraints: { audio: true, video: false },
        local: { video: this.media.localVideo ?? undefined },
        // SessionManager picks only one remote element. Attach video separately
        // below, muted, so both voice-only calls and video calls have audio.
        remote: { audio: this.media.remoteAudio ?? undefined },
      },
      userAgentOptions: {
        authorizationUsername: extension.trim(),
        displayName,
        authorizationPassword: password,
        logConfiguration: false,
        logLevel: 'error',
      },
      delegate: {
        onServerConnect: () =>
          current() && this.update({ connection: 'connected' }),
        onRegistered: () =>
          current() && this.update({ connection: 'registered' }),
        onUnregistered: () =>
          current() &&
          this.update({
            connection:
              this.state.connection === 'disconnected'
                ? 'disconnected'
                : 'connected',
          }),
        onServerDisconnect: () => {
          if (!current()) return
          this.failPendingMessages('Mất kết nối WSS.')
          this.finishCall('INTERRUPTED')
          this.clearCall()
          this.update({ connection: 'disconnected' })
        },
        onCallCreated: (session) => {
          if (!current() || this.session) return
          this.session = session
          const previous = session.delegate?.onSessionDescriptionHandler
          session.delegate = {
            ...session.delegate,
            onSessionDescriptionHandler: (handler, provisional) => {
              previous?.(handler, provisional)
              this.bindRemoteVideo(session, handler)
            },
          }
        },
        onCallReceived: (session) => {
          if (!current()) return
          // SIP.js passes an Invitation here, but the delegate declares Session.
          const call = incomingCall(session as Invitation, this.domain)
          if (this.session !== session || this.callPending) {
            call.status = 'MISSED'
            this.reportCall(call, call.startedAt)
            void manager.decline(session).catch((error) => this.onError(error))
            return
          }
          this.callRecord = call
          const previous = session.delegate?.onCancel
          session.delegate = {
            ...session.delegate,
            onCancel: (cancel) => {
              const reasons = cancel.request.getHeaders('Reason')
              call.status = reasons.some((reason) =>
                /(?:^|,)\s*SIP\s*;[^,]*\bcause\s*=\s*200\b/i.test(reason),
              )
                ? 'ANSWERED_ELSEWHERE'
                : (call.status ?? 'MISSED')
              previous?.(cancel)
            },
          }
          this.update({
            call: 'incoming',
            peer: call.peer,
            offeredVideo: call.video,
          })
        },
        onCallAnswered: (session) => {
          if (!current() || this.session !== session) return
          const hasVideo = Boolean(
            manager.getLocalMediaStream(session)?.getVideoTracks().length,
          )
          if (this.callRecord) {
            this.callRecord.answeredAt ??= Math.max(
              Date.now(),
              this.callRecord.startedAt,
            )
            this.callRecord.video = hasVideo
            this.callRecord.status = undefined
          }
          this.bindRemoteVideo(session)
          if (!this.remoteVideoObserver && this.media.remoteVideo) {
            this.media.remoteVideo.srcObject =
              manager.getRemoteMediaStream(session) ?? null
            void this.media.remoteVideo.play().catch(() => {
              this.onError(
                new Error(
                  'Không tự phát được video. Kiểm tra quyền autoplay của trình duyệt.',
                ),
              )
            })
          }
          this.update({
            call: 'active',
            hasVideo,
            cameraOff: false,
            muted: false,
          })
        },
        onCallHangup: (session) => {
          if (current() && this.session === session) {
            this.finishCall()
            this.clearCall()
          }
        },
        onMessageReceived: (message) => {
          if (!current()) return
          const type = message.request
            .getHeader('Content-Type')
            ?.split(';')[0]
            .trim()
            .toLowerCase()
          // Ignore unsupported payloads (including delivery receipts) silently.
          if (type !== 'text/plain') return
          this.onMessage({
            id: createLocalId(),
            account: aor,
            peer: message.request.from.uri.toString(),
            senderName: message.request.from.displayName,
            direction: 'incoming',
            body: message.request.body,
            status: 'received',
            time: Date.now(),
          })
        },
      },
    })
    this.manager = manager
    if (typeof window !== 'undefined') {
      this.beforeUnload = () => {
        void this.disconnect().catch(() => {})
      }
      window.addEventListener('beforeunload', this.beforeUnload)
    }
    this.update({ connection: 'connecting' })
    try {
      await manager.connect()
      if (!current()) return
      this.update({ connection: 'registering' })
      await manager.register({
        requestDelegate: {
          onReject: (response) => {
            if (!current()) return
            this.update({ connection: 'connected' })
            this.onError(responseError(response))
          },
        },
      })
    } catch (error) {
      if (current()) await this.disconnect()
      throw error
    }
  }

  private requireRegistered() {
    if (this.state.connection !== 'registered' || !this.manager)
      throw new Error('Cần đăng ký SIP trước.')
    return this.manager
  }

  async call(
    target: string,
    video: boolean,
    name = '',
    dialedPhoneNumber?: string,
  ) {
    const manager = this.requireRegistered()
    if (this.session || this.callPending)
      throw new Error('Đang có một cuộc gọi khác.')
    const peer = sipAddress(target, this.domain).toString()
    const generation = this.generation
    const call: PendingCall = {
      id: createLocalId(),
      direction: 'OUTGOING',
      peer,
      name,
      video,
      dialedPhoneNumber,
      startedAt: Date.now(),
      answeredAt: null,
    }
    this.callRecord = call
    this.callPending = true
    this.update({ call: 'outgoing', peer, offeredVideo: video })
    try {
      await manager.call(
        peer,
        {
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video },
          },
        },
        {
          requestDelegate: {
            onProgress: (response) => {
              if (response.message.statusCode === 180) call.rang = true
            },
            onReject: (response) => {
              call.response = response.message.statusCode
              if (this.manager === manager)
                this.onError(responseError(response))
            },
          },
        },
      )
    } catch (error) {
      if (this.callRecord === call) {
        if (this.session) await manager.hangup(this.session).catch(() => {})
        if (this.callRecord === call) {
          this.finishCall()
          this.clearCall()
        }
      }
      throw error
    } finally {
      if (generation === this.generation) this.callPending = false
    }
  }

  async answer(video: boolean) {
    const manager = this.manager
    if (this.state.call !== 'incoming' || !this.session || !manager)
      throw new Error('Không có cuộc gọi đến.')
    const session = this.session
    const generation = this.generation
    if (this.callRecord) this.callRecord.answering = true
    this.update({ call: 'answering' })
    try {
      await manager.answer(session, {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: video && this.state.offeredVideo },
        },
      })
    } catch (error) {
      if (generation === this.generation && this.session === session) {
        if (this.callRecord) this.callRecord.status = 'FAILED'
        await manager.hangup(session).catch(() => {})
        if (this.session === session) {
          this.finishCall()
          this.clearCall()
        }
      }
      throw error
    }
  }

  async hangup() {
    if (!this.session || this.state.call === 'ending') return
    const session = this.session
    const generation = this.generation
    const incoming = this.state.call === 'incoming'
    if (this.callRecord && this.callRecord.answeredAt === null)
      this.callRecord.status = incoming ? 'DECLINED' : 'CANCELED'
    this.update({ call: 'ending' })
    try {
      const manager = this.manager
      if (!manager) return
      if (incoming) await manager.decline(session)
      else await manager.hangup(session)
    } catch (error) {
      if (generation === this.generation && this.session === session) {
        this.finishCall()
        this.clearCall()
      }
      throw error
    }
  }

  toggleTrack(kind: 'audio' | 'video') {
    const manager = this.manager
    if (this.state.call !== 'active' || !this.session || !manager) return
    const tracks =
      manager
        .getLocalMediaStream(this.session)
        ?.getTracks()
        .filter((track) => track.kind === kind) || []
    if (!tracks.length)
      throw new Error(
        kind === 'video'
          ? 'Cuộc gọi này không có camera.'
          : 'Không có microphone.',
      )
    const disabled =
      kind === 'audio' ? !this.state.muted : !this.state.cameraOff
    tracks.forEach((track) => {
      track.enabled = !disabled
    })
    this.update(
      kind === 'audio' ? { muted: disabled } : { cameraOff: disabled },
    )
  }

  async sendMessage(target: string, body: string) {
    this.requireRegistered()
    if (!body.trim()) throw new Error('Nhập nội dung tin nhắn.')
    const uri = sipAddress(target, this.domain)
    const id = createLocalId()
    this.onMessage({
      id,
      account: this.aor,
      peer: uri.toString(),
      direction: 'outgoing',
      body,
      status: 'pending',
      time: Date.now(),
    })
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        const pending = this.pendingMessages.get(id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pendingMessages.delete(id)
        this.onMessage({ id, status: error ? 'failed' : 'accepted' })
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'Chưa nhận phản hồi MESSAGE sau 35 giây; chưa xác nhận được tin đã gửi.',
            ),
          ),
        35000,
      )
      this.pendingMessages.set(id, { timer, finish })
      try {
        const manager = this.requireRegistered()
        const messager = new this.Messager(
          manager.userAgent,
          uri,
          body,
          'text/plain',
        )
        messager
          .message({
            requestDelegate: {
              onAccept: () => finish(),
              onReject: (response) => finish(responseError(response)),
            },
          })
          .catch(finish)
      } catch (error) {
        finish(error)
      }
    })
  }

  private failPendingMessages(reason: string) {
    for (const pending of this.pendingMessages.values())
      pending.finish(new Error(reason))
  }

  async disconnect() {
    if (this.beforeUnload && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnload)
      this.beforeUnload = null
    }
    this.generation += 1
    const manager = this.manager
    this.manager = null
    this.callPending = false
    this.failPendingMessages('Đã ngắt kết nối trước khi nhận phản hồi MESSAGE.')
    this.finishCall('INTERRUPTED')
    this.clearCall()
    this.update({ connection: 'disconnected' })
    this.stopping = this.stopping
      .catch(() => {})
      .then(() => manager?.disconnect())
    await this.stopping
  }
}
