import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppSession } from '../../lib/contracts'
import { api, errorMessage } from '../../lib/api'
import { useToast } from '../../components/toast-context'
import { MessageContext } from './message-context'
import { messageReducer, normalizePeer } from './message-store'
import type { MessageAction, MessageState } from './message-store'
import { HistoryWriter } from './history-writer'

export function MessageProvider({
  session,
  children,
}: {
  session: AppSession
  children: ReactNode
}) {
  const [conversations, setConversations] = useState<MessageState>({})
  const current = useRef<MessageState>({})
  const writer = useRef<HistoryWriter | null>(null)
  const notify = useToast()
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [moreConversations, setMoreConversations] = useState(false)
  const listCursor = useRef<string | null>(null)
  const listBusy = useRef(false)
  const [loadingPeers, setLoadingPeers] = useState<Set<string>>(new Set())
  const peerBusy = useRef(new Set<string>())
  const [peerErrors, setPeerErrors] = useState<Record<string, string>>({})
  const lifetime = useRef<AbortController | null>(null)
  const apply = useCallback((action: MessageAction) => {
    current.current = messageReducer(current.current, action)
    setConversations(current.current)
  }, [])

  // Stable dispatch is a SIP connection dependency: history must never recreate
  // the SIP client or interrupt calls.
  const dispatch = useCallback(
    (action: MessageAction) => {
      apply(action)
      if (action.type !== 'message') return
      for (const conversation of Object.values(current.current)) {
        const message = conversation.messages.find(
          (item) => item.id === action.event.id,
        )
        if (!message || message.status === 'unknown') continue
        writer.current?.enqueue(message.id, {
          account: message.account,
          peer: message.peer,
          name: conversation.name.slice(0, 255),
          direction: message.direction,
          body: message.body,
          status: message.status,
          time: message.time,
          ...(message.senderName
            ? { senderName: message.senderName.slice(0, 255) }
            : {}),
        })
        break
      }
    },
    [apply],
  )

  const loadConversations = useCallback(async () => {
    const abort = lifetime.current
    if (!abort || abort.signal.aborted || listBusy.current) return
    listBusy.current = true
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const page = await api.historyConversations(
        session.accessToken,
        listCursor.current ?? undefined,
        abort.signal,
      )
      if (abort.signal.aborted) return
      apply({ type: 'history-list', conversations: page.content })
      listCursor.current = page.nextCursor
      setMoreConversations(page.nextCursor !== null)
    } catch (error) {
      if (!abort.signal.aborted) setHistoryError(errorMessage(error))
    } finally {
      if (!abort.signal.aborted) {
        listBusy.current = false
        setHistoryLoading(false)
      }
    }
  }, [session.accessToken, apply])

  const loadHistory = useCallback(
    async (value: string) => {
      const peer = normalizePeer(value),
        abort = lifetime.current
      const conversation = current.current[peer]
      if (
        !abort ||
        abort.signal.aborted ||
        peerBusy.current.has(peer) ||
        (conversation?.historyLoaded && !conversation.historyCursor)
      )
        return
      peerBusy.current.add(peer)
      setLoadingPeers(new Set(peerBusy.current))
      setPeerErrors((errors) => ({ ...errors, [peer]: '' }))
      try {
        const page = await api.historyMessages(
          session.accessToken,
          peer,
          conversation?.historyCursor ?? undefined,
          abort.signal,
        )
        if (!abort.signal.aborted) apply({ type: 'history', peer, page })
      } catch (error) {
        if (!abort.signal.aborted)
          setPeerErrors((errors) => ({
            ...errors,
            [peer]: errorMessage(error),
          }))
      } finally {
        if (!abort.signal.aborted) {
          peerBusy.current.delete(peer)
          setLoadingPeers(new Set(peerBusy.current))
        }
      }
    },
    [session.accessToken, apply],
  )

  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    listBusy.current = false
    peerBusy.current.clear()
    const sync = new HistoryWriter(
      (id, message) => api.saveHistory(session.accessToken, id, message),
      (id, status) => apply({ type: 'history-save', id, status }),
      () =>
        notify({
          id: 'history-save-error',
          tone: 'error',
          message:
            'Chưa lưu được lịch sử trò chuyện. Hãy thử lại trước khi đóng trang.',
          action: { label: 'Thử lại', onClick: () => sync.retry() },
        }),
    )
    writer.current = sync
    const retry = () => {
      sync.retry()
      void loadConversations()
    }
    window.addEventListener('online', retry)
    void loadConversations()
    return () => {
      abort.abort()
      sync.stop()
      writer.current = null
      window.removeEventListener('online', retry)
    }
  }, [session.accessToken, apply, loadConversations, notify])

  return (
    <MessageContext.Provider
      value={{
        conversations,
        dispatch,
        historyLoading,
        historyError,
        moreConversations,
        loadConversations,
        loadingPeers,
        peerErrors,
        loadHistory,
        retrySave: () => writer.current?.retry(),
      }}
    >
      {children}
    </MessageContext.Provider>
  )
}
