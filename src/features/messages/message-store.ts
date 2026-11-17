import type { DirectoryUser } from '../../lib/contracts'

export interface ChatMessage {
  id: string
  account: string
  peer: string
  direction: 'incoming' | 'outgoing'
  body: string
  status: 'pending' | 'accepted' | 'failed' | 'received'
  time: number
  senderName?: string
}
export type MessageEvent = Partial<ChatMessage> & Pick<ChatMessage, 'id'>
export interface Conversation {
  peer: string
  name: string
  user?: DirectoryUser
  messages: ChatMessage[]
  unread: number
  draft: string
}
export type MessageState = Record<string, Conversation>
export type MessageAction =
  | { type: 'open'; user: DirectoryUser }
  | { type: 'message'; event: MessageEvent }
  | { type: 'read'; peer: string }
  | { type: 'draft'; peer: string; value: string }

export function normalizePeer(value: string) {
  const address = value
    .trim()
    .replace(/^sips?:/i, '')
    .split(/[;?]/)[0]
  const at = address.lastIndexOf('@')
  return `sip:${at < 0 ? address : address.slice(0, at) + '@' + address.slice(at + 1).toLowerCase()}`
}
export function extensionOf(peer: string) {
  return peer.replace(/^sips?:/i, '').split('@')[0]
}

export function messageReducer(
  state: MessageState,
  action: MessageAction,
): MessageState {
  if (action.type === 'open') {
    if (!action.user.sip) return state
    const peer = normalizePeer(
      `${action.user.sip.extension}@${action.user.sip.domain}`,
    )
    const previous = state[peer] ?? {
      peer,
      messages: [],
      unread: 0,
      draft: '',
      name: action.user.displayName,
    }
    return {
      ...state,
      [peer]: { ...previous, name: action.user.displayName, user: action.user },
    }
  }
  if (action.type === 'message') {
    const event = action.event
    // Status acknowledgments contain only id/status. They update an existing
    // message and must never create a second message or a blank conversation.
    for (const conversation of Object.values(state)) {
      const index = conversation.messages.findIndex(
        (message) => message.id === event.id,
      )
      if (index >= 0)
        return {
          ...state,
          [conversation.peer]: {
            ...conversation,
            messages: conversation.messages.map((message, i) =>
              i === index ? { ...message, ...event } : message,
            ),
          },
        }
    }
    if (
      !event.peer ||
      !event.direction ||
      typeof event.body !== 'string' ||
      !event.time
    )
      return state
    const peer = normalizePeer(event.peer)
    const previous = state[peer] ?? {
      peer,
      name: event.senderName || `Máy nhánh ${extensionOf(peer)}`,
      messages: [],
      draft: '',
      unread: 0,
    }
    return {
      ...state,
      [peer]: {
        ...previous,
        messages: [...previous.messages, { ...event, peer } as ChatMessage],
        unread: previous.unread + (event.direction === 'incoming' ? 1 : 0),
      },
    }
  }
  const peer = normalizePeer(action.peer)
  const conversation = state[peer]
  if (!conversation) return state
  if (action.type === 'read')
    return conversation.unread
      ? { ...state, [peer]: { ...conversation, unread: 0 } }
      : state
  return { ...state, [peer]: { ...conversation, draft: action.value } }
}
