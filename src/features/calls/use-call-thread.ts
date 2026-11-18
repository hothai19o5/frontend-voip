import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useSession } from '../auth/use-session'
import { callKey, useCallHistory } from './call-history-context'
import type { CallEntry, CallPage, CallResult } from './call-history-context'

type Snapshot = {
  peer: string
  key: string
  page: CallPage<CallEntry> | null
  paginated?: boolean
  failed?: boolean
}

function merge<T extends CallResult>(older: T[], newer: T[]) {
  const calls = new Map(older.map((call) => [callKey(call), call]))
  for (const call of newer) calls.set(callKey(call), call)
  return Array.from(calls.values())
}

export function useCallThread(peer: string | undefined) {
  const { session } = useSession()
  const token = session?.accessToken
  const { threads, observed, revision } = useCallHistory()
  const last = peer ? threads[peer]?.lastCall : undefined
  const local = peer ? observed[peer] : undefined
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController>(null)
  const key = `${revision}:${attempt}:${last?.sequence ?? ''}:${last?.status ?? ''}:${last?.endedAt ?? ''}`
  const current = snapshot?.peer === peer ? snapshot : null

  useEffect(() => {
    if (!token || !peer) return
    const abort = new AbortController()
    request.current = abort
    void api
      .callHistory(token, peer, null, abort.signal)
      .then((page) => {
        if (abort.signal.aborted) return
        setSnapshot((previous) => {
          if (previous?.peer === peer && previous.paginated && previous.page) {
            return {
              peer,
              key,
              paginated: true,
              page: {
                content: merge(previous.page.content, page.content),
                nextCursor: previous.page.nextCursor,
              },
            }
          }
          return { peer, key, page }
        })
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setSnapshot((previous) => ({
            page: null,
            ...(previous?.peer === peer ? previous : {}),
            peer,
            key,
            failed: true,
          }))
      })
      .finally(() => {
        if (request.current === abort) request.current = null
      })
    return () => request.current?.abort()
  }, [key, peer, token])

  async function loadOlder() {
    if (
      !token ||
      !peer ||
      request.current ||
      current?.key !== key ||
      !current.page?.nextCursor
    )
      return
    const abort = new AbortController()
    request.current = abort
    try {
      const page = await api.callHistory(
        token,
        peer,
        current.page.nextCursor,
        abort.signal,
      )
      if (!abort.signal.aborted)
        setSnapshot({
          peer,
          key,
          paginated: true,
          page: {
            content: merge(current.page.content, page.content),
            nextCursor: page.nextCursor,
          },
        })
    } catch {
      if (!abort.signal.aborted) setSnapshot({ ...current, failed: true })
    } finally {
      if (request.current === abort) request.current = null
    }
  }

  const calls = useMemo(
    () =>
      merge(local ?? [], [
        ...(last ? [last] : []),
        ...(current?.page?.content ?? []),
      ]),
    [current?.page, last, local],
  )

  return {
    calls,
    loading: Boolean(peer && current?.key !== key),
    failed: current?.key === key && current.failed,
    hasOlder: Boolean(current?.page?.nextCursor),
    loadOlder,
    retry: () => setAttempt((value) => value + 1),
  }
}
