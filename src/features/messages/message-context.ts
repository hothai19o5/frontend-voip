import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { MessageAction, MessageState } from './message-store'

export const MessageContext = createContext<{
  conversations: MessageState
  dispatch: Dispatch<MessageAction>
} | null>(null)
export function useMessages() {
  const value = useContext(MessageContext)
  if (!value) throw new Error('useMessages requires MessageProvider')
  return value
}
