import { createContext, useContext } from 'react'
import type { DirectoryUser } from '../../lib/contracts'
import type { SipState } from './types'

export type SafeSipAccount = {
  extension: string
  domain: string
  wssUrl: string
}
interface SipContextValue {
  state: SipState
  account: SafeSipAccount | null
  error: string
  loading: boolean
  peerName: string
  startedAt: number | null
  retry: () => void
  call: (user: DirectoryUser, video?: boolean) => Promise<void>
  callAddress: (peer: string, name: string, video?: boolean) => Promise<void>
  sendMessage: (peer: string, body: string) => Promise<boolean>
  answer: (video?: boolean) => Promise<void>
  hangup: () => Promise<void>
  toggle: (kind: 'audio' | 'video') => Promise<void>
  replay: () => Promise<void>
  dismissError: () => void
}
export const SipContext = createContext<SipContextValue | null>(null)

export function useSip() {
  const value = useContext(SipContext)
  if (!value) throw new Error('useSip requires SipProvider')
  return value
}
