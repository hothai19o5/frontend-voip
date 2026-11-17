import { useReducer } from 'react'
import type { ReactNode } from 'react'
import { MessageContext } from './message-context'
import { messageReducer } from './message-store'

// Mounted once per app session. Navigation, searches and SIP reconnects preserve
// conversations; logout/expiry destroy the provider and all drafts/history.
export function MessageProvider({ children }: { children: ReactNode }) {
  const [conversations, dispatch] = useReducer(messageReducer, {})
  return (
    <MessageContext.Provider value={{ conversations, dispatch }}>
      {children}
    </MessageContext.Provider>
  )
}
