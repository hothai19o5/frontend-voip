import { createContext, useContext } from 'react'

export interface DialedCall {
  id: string
  phoneNumber: string
  route: 'APP_TO_APP' | 'APP_TO_PHONE'
  name: string | null
  status: CallStatus
  startedAt: number
  answeredAt: number | null
  endedAt: number
}

export interface ResolvedPhoneCall {
  type: DialedCall['route']
  phoneNumber: string
  sipUri: string
  displayName: string | null
}

export type CallStatus =
  | 'COMPLETED'
  | 'MISSED'
  | 'DECLINED'
  | 'CANCELED'
  | 'BUSY'
  | 'UNANSWERED'
  | 'FAILED'
  | 'INTERRUPTED'
  | 'ANSWERED_ELSEWHERE'

type CallDetails = {
  peer: string
  name: string | null
  direction: 'INCOMING' | 'OUTGOING'
  status: CallStatus
  video: boolean
  startedAt: number
  answeredAt: number | null
  endedAt: number
  dialedPhoneNumber?: string
}

export type CallResult = CallDetails & { id: string }
export type CallEntry = CallResult & { sequence: string; unread: boolean }
export type CallPage<T> = { content: T[]; nextCursor: string | null }
export type MissedCalls = { unread: number; through: string | null }
export type CallThread = { lastCall: CallEntry; missed: MissedCalls }

export function callKey(call: CallResult) {
  return `${call.direction}:${call.id}`
}

export const CallHistoryContext = createContext<{
  recordCall: (call: CallResult) => void
  threads: Record<string, CallThread>
  observed: Record<string, CallResult[]>
  revision: number
  moreThreads: boolean
  threadsLoading: boolean
  threadsFailed: boolean
  loadThreads: (older?: boolean) => Promise<void>
  markSeen: (peer: string, through: string) => Promise<void>
} | null>(null)

export function useCallHistory() {
  const value = useContext(CallHistoryContext)
  if (!value) throw new Error('useCallHistory requires CallHistoryProvider')
  return value
}
