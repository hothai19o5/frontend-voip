import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useToast } from '../../components/toast-context'
import { api } from '../../lib/api'
import { HistoryWriter } from '../messages/history-writer'
import { useMessages } from '../messages/message-context'
import { normalizePeer } from '../messages/message-store'
import { callKey, CallHistoryContext } from './call-history-context'
import type { CallResult, CallThread } from './call-history-context'
import { isPstnPeer } from './phone-number'

export function CallHistoryProvider({
  token,
  children,
}: {
  token: string
  children: ReactNode
}) {
  const [threads, setThreads] = useState<Record<string, CallThread>>({})
  const [observed, setObserved] = useState<Record<string, CallResult[]>>({})
  const [revision, setRevision] = useState(0)
  const [moreThreads, setMoreThreads] = useState(false)
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadsFailed, setThreadsFailed] = useState(false)
  const lifetime = useRef<AbortController>(null)
  const writer = useRef<HistoryWriter<CallResult>>(null)
  const listing = useRef(false)
  const pendingRefresh = useRef(false)
  const cursor = useRef<string | null>(null)
  const paginated = useRef(false)
  const marking = useRef(new Set<string>())
  const seenThrough = useRef(new Map<string, bigint>())
  const notify = useToast()
  const { dispatch } = useMessages()

  const loadThreads = useCallback(
    async function load(older = false) {
      const abort = lifetime.current
      if (!abort || abort.signal.aborted || (older && !cursor.current)) return
      if (listing.current) {
        if (!older) pendingRefresh.current = true
        return
      }
      listing.current = true
      setThreadsLoading(true)
      try {
        const page = await api.callThreads(
          token,
          older ? cursor.current : null,
          abort.signal,
        )
        if (abort.signal.aborted) return
        dispatch({
          type: 'call-peers',
          peers: page.content.map((thread) => thread.lastCall),
        })
        setThreads((current) => {
          const next = { ...current }
          for (const thread of page.content) {
            const peer = normalizePeer(thread.lastCall.peer)
            const acknowledged = seenThrough.current.get(peer)
            const { through } = thread.missed
            next[peer] =
              acknowledged && through && BigInt(through) <= acknowledged
                ? { ...thread, missed: { unread: 0, through: null } }
                : thread
          }
          return next
        })
        if (older) paginated.current = true
        if (older || !paginated.current) {
          cursor.current = page.nextCursor
          setMoreThreads(page.nextCursor !== null)
        }
        setThreadsFailed(false)
      } catch {
        if (!abort.signal.aborted) setThreadsFailed(true)
      } finally {
        if (!abort.signal.aborted) {
          listing.current = false
          setThreadsLoading(false)
          if (pendingRefresh.current) {
            pendingRefresh.current = false
            void load()
          }
        }
      }
    },
    [dispatch, token],
  )

  const recordCall = useCallback(
    (call: CallResult) => {
      const peer = normalizePeer(call.peer)
      const result = { ...call, peer }
      if (
        result.dialedPhoneNumber &&
        isPstnPeer(peer, result.dialedPhoneNumber)
      ) {
        writer.current?.enqueue(callKey(result), result)
        return
      }
      dispatch({ type: 'call-peers', peers: [result] })
      setObserved((current) => ({
        ...current,
        [peer]: [
          ...(current[peer] ?? []).filter(
            (item) => callKey(item) !== callKey(result),
          ),
          result,
        ],
      }))
      writer.current?.enqueue(callKey(result), result)
    },
    [dispatch],
  )

  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    listing.current = false
    pendingRefresh.current = false
    const sync = new HistoryWriter<CallResult>(
      (_id, call) => api.saveCall(token, call),
      (_id, status) => {
        if (status === 'saved') {
          setRevision((value) => value + 1)
          void loadThreads()
        }
      },
      () =>
        notify({
          id: 'call-history-save-error',
          tone: 'error',
          message: 'Chưa lưu được cuộc gọi vào lịch sử.',
          action: { label: 'Thử lại', onClick: () => sync.retry() },
        }),
    )
    writer.current = sync
    const resume = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      sync.retry()
      void loadThreads()
    }
    void loadThreads()
    const timer = window.setInterval(() => {
      if (
        !listing.current &&
        document.visibilityState === 'visible' &&
        navigator.onLine
      )
        void loadThreads()
    }, 15000)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      abort.abort()
      writer.current = null
      sync.stop()
      window.clearInterval(timer)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [loadThreads, notify, token])

  const markSeen = useCallback(
    async (peer: string, through: string) => {
      const abort = lifetime.current
      if (!abort || abort.signal.aborted || marking.current.has(peer)) return
      const acknowledged = BigInt(through)
      if (acknowledged <= (seenThrough.current.get(peer) ?? 0n)) return
      marking.current.add(peer)
      try {
        const missed = await api.markMissedCallsSeen(token, peer, through)
        if (abort.signal.aborted) return
        seenThrough.current.set(peer, acknowledged)
        setThreads((current) =>
          current[peer]?.missed.through === through
            ? { ...current, [peer]: { ...current[peer], missed } }
            : current,
        )
      } catch {
        // Retain the unread count and try again on the next list refresh or focus.
      } finally {
        marking.current.delete(peer)
      }
    },
    [token],
  )

  return (
    <CallHistoryContext.Provider
      value={{
        recordCall,
        threads,
        observed,
        revision,
        moreThreads,
        threadsLoading,
        threadsFailed,
        loadThreads,
        markSeen,
      }}
    >
      {children}
    </CallHistoryContext.Provider>
  )
}
