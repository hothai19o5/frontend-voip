import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, errorMessage } from '../../lib/api'
import type { AppSession, DirectoryUser } from '../../lib/contracts'
import { SipClient, INITIAL_STATE } from './sip-client.js'
import type { SipState } from './types'
import { CallPanel } from './call-panel'
import { SipContext } from './sip-context'
import type { SafeSipAccount } from './sip-context'
import { useMessages } from '../messages/message-context'
import type { MessageEvent } from '../messages/message-store'

// This provider and all media elements sit ABOVE the route outlet. Navigation
// never destroys the user agent or detaches a call's media elements.
export function SipProvider({
  session,
  children,
}: {
  session: AppSession
  children: ReactNode
}) {
  const client = useRef<InstanceType<typeof SipClient> | null>(null)
  const { dispatch } = useMessages()
  const remoteAudio = useRef<HTMLAudioElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<SipState>(INITIAL_STATE as SipState)
  const [account, setAccount] = useState<SafeSipAccount | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [peerName, setPeerName] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const abort = new AbortController()
    const service = new SipClient({
      media: {
        remoteAudio: remoteAudio.current,
        remoteVideo: remoteVideo.current,
        localVideo: localVideo.current,
      },
      onState: (next: SipState) => {
        if (!alive) return
        setState(next)
        if (next.call === 'active') setStartedAt((value) => value ?? Date.now())
        if (next.call === 'idle') {
          setStartedAt(null)
          setPeerName('')
        }
      },
      onError: (cause: unknown) => {
        if (alive) setError(errorMessage(cause))
      },
      onMessage: (event: MessageEvent) => {
        if (alive) dispatch({ type: 'message', event })
      },
    })
    client.current = service
    async function start() {
      try {
        const config = await api.sipAccount(session.accessToken, abort.signal)
        if (!alive) return
        setAccount({
          extension: config.extension,
          domain: config.domain,
          wssUrl: config.wssUrl,
        })
        await service.connect({
          server: config.wssUrl,
          domain: config.domain,
          extension: config.extension,
          password: config.password,
          displayName: session.user.displayName,
        })
      } catch (cause) {
        if (alive) setError(errorMessage(cause))
      } finally {
        if (alive) setLoading(false)
      }
    }
    void start()
    return () => {
      alive = false
      abort.abort()
      client.current = null
      void service.disconnect().catch(() => {})
    }
  }, [session.accessToken, session.user.displayName, attempt, dispatch])

  const run = useCallback(
    async (action: (service: InstanceType<typeof SipClient>) => unknown) => {
      const service = client.current
      if (!service) return
      setError('')
      try {
        await action(service)
      } catch (cause) {
        if (client.current === service) setError(errorMessage(cause))
      }
    },
    [],
  )

  const call = async (user: DirectoryUser, video = false) => {
    if (
      user.status !== 'ACTIVE' ||
      user.sip?.provisioningStatus !== 'READY' ||
      user.sip.extensionPresent !== true
    )
      return
    setPeerName(user.displayName)
    await run((service) =>
      service.call(`sip:${user.sip!.extension}@${user.sip!.domain}`, video),
    )
  }

  return (
    <SipContext.Provider
      value={{
        state,
        account,
        error,
        loading,
        peerName,
        startedAt,
        retry: () => {
          if (state.call !== 'idle' || loading) return
          setLoading(true)
          setError('')
          setAccount(null)
          setState({ ...INITIAL_STATE, connection: 'connecting' } as SipState)
          setAttempt((value) => value + 1)
        },
        call,
        callAddress: (peer, name, video = false) => {
          setPeerName(name)
          return run((service) => service.call(peer, video))
        },
        sendMessage: async (peer, body) => {
          const service = client.current
          if (!service) return false
          setError('')
          try {
            await service.sendMessage(peer, body)
            return true
          } catch (cause) {
            if (client.current === service) setError(errorMessage(cause))
            return false
          }
        },
        answer: (video = false) => run((service) => service.answer(video)),
        hangup: () => run((service) => service.hangup()),
        toggle: (kind) => run((service) => service.toggleTrack(kind)),
        replay: () =>
          run(async (service) => {
            await service.replayRemoteVideo()
            await remoteAudio.current?.play()
          }),
        dismissError: () => setError(''),
      }}
    >
      {children}
      <audio ref={remoteAudio} autoPlay aria-label="Âm thanh cuộc gọi" />
      <CallPanel>
        <div
          className={`call-video-stage ${state.call === 'active' && (state.hasVideo || state.offeredVideo) ? 'is-visible' : ''}`}
          aria-hidden={state.call !== 'active'}
        >
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            muted
            className="remote-video"
            aria-label="Video người gọi"
          />
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            className="local-video"
            aria-label="Video của bạn"
          />
        </div>
      </CallPanel>
    </SipContext.Provider>
  )
}
