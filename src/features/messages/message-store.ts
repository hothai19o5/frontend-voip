import type { DirectoryUser } from '../../lib/contracts'

export interface ChatMessage {
  id: string
  account: string
  peer: string
  direction: 'incoming' | 'outgoing'
  body: string
  status: 'pending' | 'accepted' | 'failed' | 'received' | 'unknown'
  time: number
  senderName?: string
  historyState?: 'saving' | 'saved' | 'failed'
}
export interface HistoryEntry extends Omit<ChatMessage, 'status'> {
  sequence: string
  name: string
  status: Exclude<ChatMessage['status'], 'unknown'>
}
export interface HistoryPage<T> {
  content: T[]
  nextCursor: string | null
}
export interface HistoryConversation {
  peer: string
  name: string
  lastMessage: HistoryEntry
}
export type MessageEvent = Partial<ChatMessage> & Pick<ChatMessage, 'id'>
export interface Conversation {
  peer: string
  name: string
  user?: DirectoryUser
  messages: ChatMessage[]
  unread: number
  draft: string
  historyLoaded?: boolean
  historyCursor?: string | null
}
export type MessageState = Record<string, Conversation>
export type MessageAction =
  | { type: 'open'; user: DirectoryUser }
  | { type: 'message'; event: MessageEvent }
  | { type: 'read'; peer: string }
  | { type: 'draft'; peer: string; value: string }
  | { type: 'history-list'; conversations: HistoryConversation[] }
  | { type: 'history'; peer: string; page: HistoryPage<HistoryEntry> }
  | { type: 'history-save'; id: string; status: ChatMessage['historyState'] }

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
  if (action.type === 'history-save') {
    for (const conversation of Object.values(state)) {
      if (!conversation.messages.some((message) => message.id === action.id))
        continue
      return {
        ...state,
        [conversation.peer]: {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === action.id
              ? { ...message, historyState: action.status }
              : message,
          ),
        },
      }
    }
    return state
  }
  if (action.type === 'history-list' || action.type === 'history') {
    const next = { ...state }
    const entries =
      action.type === 'history-list'
        ? action.conversations.map((item) => ({
            peer: item.peer,
            name: item.name,
            messages: [item.lastMessage],
          }))
        : [
            {
              peer: action.peer,
              name: action.page.content[0]?.name,
              messages: action.page.content,
            },
          ]
    for (const entry of entries) {
      const peer = normalizePeer(entry.peer)
      const previous = next[peer]
      // Current messages win over an older HTTP snapshot. Hydration never adds
      // unread counts or overwrites a draft while the user is typing.
      const messages = new Map<string, ChatMessage>(
        entry.messages.map((message) => [
          message.id,
          {
            ...message,
            peer,
            historyState: 'saved',
            status: message.status === 'pending' ? 'unknown' : message.status,
          },
        ]),
      )
      for (const message of previous?.messages ?? []) {
        const fetched = messages.get(message.id)
        // A previously restored pending record can later acquire a final result
        // on the server. Keep live changes, but accept that persisted upgrade.
        if (
          message.historyState === 'saved' &&
          message.status === 'unknown' &&
          fetched &&
          fetched.status !== 'unknown'
        )
          continue
        messages.set(message.id, message)
      }
      next[peer] = {
        ...(previous ?? {
          peer,
          name: entry.name || `Máy nhánh ${extensionOf(peer)}`,
          unread: 0,
          draft: '',
        }),
        messages: [...messages.values()].sort(
          (a, b) => a.time - b.time || a.id.localeCompare(b.id),
        ),
        ...(action.type === 'history'
          ? { historyLoaded: true, historyCursor: action.page.nextCursor }
          : {}),
      }
    }
    return next
  }
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
