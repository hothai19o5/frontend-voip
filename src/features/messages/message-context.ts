import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { MessageAction, MessageState } from './message-store'

export const MessageContext = createContext<{
  conversations: MessageState
  dispatch: Dispatch<MessageAction>
  sendDirect: (peer: string, body: string) => Promise<'sent' | 'sip-only'>
  historyLoading: boolean
  historyError: string
  moreConversations: boolean
  loadConversations: () => Promise<void>
  loadingPeers: ReadonlySet<string>
  peerErrors: Record<string, string>
  loadHistory: (peer: string) => Promise<void>
  retrySave: () => void
} | null>(null)
export function useMessages() {
  const value = useContext(MessageContext)
  if (!value) throw new Error('useMessages requires MessageProvider')
  return value
}
