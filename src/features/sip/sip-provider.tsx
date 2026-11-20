import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api, errorMessage } from '../../lib/api'
import type { AppSession, DirectoryUser } from '../../lib/contracts'
import { SipClient, INITIAL_STATE } from './sip-client'
import { CallPanel } from './call-panel'
import { SipContext } from './sip-context'
import type { SafeSipAccount } from './sip-context'
import { useMessages } from '../messages/message-context'
import { useCallWindow } from './use-call-window'
import { CallVideo } from './call-video'
import { Button } from '../../components/ui/button'
import { useToast } from '../../components/toast-context'
import { useCallHistory } from '../calls/call-history-context'
import { dialableNumber } from '../calls/phone-number'

// This provider and all media elements sit ABOVE the route outlet. Navigation
// never destroys the user agent or detaches a call's media elements.
export function SipProvider({
  session,
  children,
}: {
  session: AppSession
  children: ReactNode
}) {
  const client = useRef<SipClient | null>(null)
  const pendingLookup = useRef<AbortController | null>(null)
  const notify = useToast()
  const { dispatch } = useMessages()
  const { recordCall } = useCallHistory()
  const remoteAudio = useRef<HTMLAudioElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState(INITIAL_STATE)
  const [account, setAccount] = useState<SafeSipAccount | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [peerName, setPeerName] = useState('')
  const [pendingPhone, setPendingPhone] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const {
    container,
    open: openCallWindow,
    close: closeCallWindow,
    syncCall,
  } = useCallWindow()

  const cancelLookup = useCallback(() => {
    const current = pendingLookup.current
    if (!current) return false
    pendingLookup.current = null
    current.abort()
    setPendingPhone('')
    return true
  }, [])

  useEffect(() => {
    let alive = true
    const abort = new AbortController()
    const service = new SipClient({
      media: {
        remoteAudio: remoteAudio.current,
        remoteVideo: remoteVideo.current,
        localVideo: localVideo.current,
      },
      onState: (next) => {
        if (!alive) return
        setState(next)
        if (next.call !== 'idle' || next.connection !== 'registered')
          cancelLookup()
        if (!pendingLookup.current) syncCall(next.call)
        if (next.call === 'active') setStartedAt((value) => value ?? Date.now())
        if (next.call === 'idle') {
          setStartedAt(null)
          setPeerName('')
        }
      },
      onError: (cause) => {
        if (alive) setError(errorMessage(cause))
      },
      onMessage: (event) => {
        if (alive) dispatch({ type: 'message', event })
      },
      onCallResult: (call) => {
        if (alive) recordCall(call)
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
      if (cancelLookup()) closeCallWindow()
      client.current = null
      void service.disconnect().catch(() => {})
    }
  }, [
    session.accessToken,
    session.user.displayName,
    attempt,
    dispatch,
    recordCall,
    syncCall,
    cancelLookup,
    closeCallWindow,
  ])

  const run = useCallback(
    async (action: (service: SipClient) => unknown) => {
      const service = client.current
      if (!service) {
        closeCallWindow()
        return
      }
      setError('')
      try {
        await action(service)
      } catch (cause) {
        if (client.current === service) setError(errorMessage(cause))
      } finally {
        if (
          client.current === service &&
          service.state.call === 'idle' &&
          !pendingLookup.current
        )
          closeCallWindow()
      }
    },
    [closeCallWindow],
  )

  const call = async (user: DirectoryUser, video = false) => {
    if (
      user.status !== 'ACTIVE' ||
      user.sip?.provisioningStatus !== 'READY' ||
      user.sip.extensionPresent !== true
    )
      return
    await callAddress(
      `sip:${user.sip.extension}@${user.sip.domain}`,
      user.displayName,
      video,
    )
  }

  const callAddress = (peer: string, name: string, video = false) => {
    if (pendingLookup.current) return Promise.resolve()
    if (state.call === 'idle') {
      setPeerName(name)
      openCallWindow()
    }
    return run((service) => service.call(peer, video, name))
  }

  const callPhone = async (number: string, forcePstn = false) => {
    const digits = dialableNumber(number)
    const service = client.current
    if (
      !session.user.phoneCallingEnabled ||
      !service ||
      !digits ||
      pendingLookup.current ||
      service.state.call !== 'idle' ||
      service.state.connection !== 'registered'
    )
      return
    const lookup = new AbortController()
    pendingLookup.current = lookup
    const label = number.trim()
    setError('')
    setPendingPhone(label)
    openCallWindow()
    try {
      const route = await api.resolvePhoneCall(
        session.accessToken,
        digits,
        lookup.signal,
        forcePstn,
      )
      if (pendingLookup.current !== lookup) return
      if (forcePstn && route.type !== 'APP_TO_PHONE') {
        throw new Error('Chưa thể gọi qua số điện thoại.')
      }
      pendingLookup.current = null
      setPendingPhone('')
      setPeerName(label)
      await run((sip) =>
        sip.call(
          route.sipUri,
          false,
          route.displayName ?? '',
          route.phoneNumber,
        ),
      )
    } catch (cause) {
      if (pendingLookup.current !== lookup) return
      pendingLookup.current = null
      setPendingPhone('')
      closeCallWindow()
      notify({ message: errorMessage(cause), tone: 'error' })
    }
  }

  const panel = (
    <CallPanel
      detached={!!container}
      onWindow={container ? closeCallWindow : openCallWindow}
    >
      <CallVideo
        remote={remoteVideo}
        local={localVideo}
        visible={
          state.call === 'active' && (state.hasVideo || state.offeredVideo)
        }
      />
    </CallPanel>
  )

  return (
    <SipContext.Provider
      value={{
        state,
        account,
        error,
        loading,
        peerName,
        pendingPhone,
        startedAt,
        retry: () => {
          if (state.call !== 'idle' || loading || pendingLookup.current) return
          setLoading(true)
          setError('')
          setAccount(null)
          setState({ ...INITIAL_STATE, connection: 'connecting' })
          setAttempt((value) => value + 1)
        },
        call,
        callAddress,
        callPhone,
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
        hangup: async () => {
          if (cancelLookup()) closeCallWindow()
          else await run((service) => service.hangup())
        },
        toggle: (kind) => run((service) => service.toggleTrack(kind)),
        replay: () =>
          run(async (service) => {
            await service.replayRemoteVideo()
            await remoteAudio.current?.play()
            const doc = container?.ownerDocument ?? document
            await Promise.all(
              Array.from(
                doc.querySelectorAll<HTMLVideoElement>(
                  '.call-video-stage video',
                ),
                (video) => video.play(),
              ),
            )
          }),
        dismissError: () => setError(''),
      }}
    >
      {children}
      <audio ref={remoteAudio} autoPlay aria-label="Âm thanh cuộc gọi" />
      <div hidden aria-hidden="true" data-call-media-owner>
        <video ref={remoteVideo} autoPlay playsInline muted />
        <video ref={localVideo} autoPlay playsInline muted />
      </div>
      {container ? createPortal(panel, container) : panel}
      {container && (state.call !== 'idle' || pendingPhone) ? (
        <aside
          className="call-detached-bar"
          aria-label="Cuộc gọi trong cửa sổ riêng"
        >
          <span>Cuộc gọi đang mở trong cửa sổ riêng</span>
          <Button variant="secondary" onClick={openCallWindow}>
            Xem cuộc gọi
          </Button>
          <Button variant="ghost" onClick={closeCallWindow}>
            Đưa về đây
          </Button>
        </aside>
      ) : null}
    </SipContext.Provider>
  )
}
