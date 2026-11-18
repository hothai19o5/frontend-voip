import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(
  new URL('../src/features/messages/message-store.ts', import.meta.url),
  'utf8',
)
const code = stripTypeScriptTypes(source)
const { messageReducer: reduce, normalizePeer } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
)
const user = {
  id: 'member',
  displayName: 'Minh Anh',
  username: 'minhanh',
  status: 'ACTIVE',
  sip: { extension: '1002', domain: 'PBX.test' },
}
const event = {
  id: 'message-1',
  account: 'sip:1001@pbx.test',
  peer: 'sip:1002@PBX.test;transport=ws',
  body: 'Xin chào',
  time: 1000,
  direction: 'incoming',
  status: 'received',
}

test('SIP peer normalization keeps one conversation per extension/domain', () => {
  assert.equal(normalizePeer(event.peer), 'sip:1002@pbx.test')
  let state = reduce({}, { type: 'message', event })
  state = reduce(state, { type: 'open', user })
  assert.equal(Object.keys(state).length, 1)
  assert.equal(state['sip:1002@pbx.test'].name, 'Minh Anh')
  assert.equal(state['sip:1002@pbx.test'].messages.length, 1)
})

test('a late send completion cannot clear a newer draft after switching conversations', () => {
  let state = reduce({}, { type: 'message', event })
  state = reduce(state, {
    type: 'draft',
    peer: event.peer,
    value: 'Đang soạn tin mới',
  })
  const unchanged = reduce(state, {
    type: 'draft',
    peer: event.peer,
    value: '',
    expected: 'Tin vừa gửi',
  })
  assert.equal(unchanged, state)
  state = reduce(state, {
    type: 'draft',
    peer: event.peer,
    value: '',
    expected: 'Đang soạn tin mới',
  })
  assert.equal(state[normalizePeer(event.peer)].draft, '')
})

test('transport acknowledgment updates one message without inventing a read receipt', () => {
  let state = reduce(
    {},
    {
      type: 'message',
      event: { ...event, direction: 'outgoing', status: 'pending' },
    },
  )
  state = reduce(state, {
    type: 'message',
    event: { id: event.id, status: 'accepted' },
  })
  assert.equal(state['sip:1002@pbx.test'].messages.length, 1)
  assert.equal(state['sip:1002@pbx.test'].messages[0].status, 'accepted')
  assert.equal(state['sip:1002@pbx.test'].unread, 0)
  assert.equal(
    reduce(state, {
      type: 'message',
      event: { id: 'unknown', status: 'failed' },
    }),
    state,
  )
})

test('incoming messages create an unread conversation; reading and drafts preserve history', () => {
  let state = reduce({}, { type: 'message', event })
  assert.equal(state['sip:1002@pbx.test'].unread, 1)
  state = reduce(state, { type: 'draft', peer: event.peer, value: 'Bản nháp' })
  state = reduce(state, { type: 'read', peer: event.peer })
  assert.equal(state['sip:1002@pbx.test'].draft, 'Bản nháp')
  assert.equal(state['sip:1002@pbx.test'].unread, 0)
  assert.equal(state['sip:1002@pbx.test'].messages[0].body, event.body)
  assert.equal(reduce(state, { type: 'read', peer: event.peer }), state)
})

test('late history hydration preserves live acknowledgment, unread and draft without duplicates', () => {
  let state = reduce({}, { type: 'message', event })
  state = reduce(state, { type: 'draft', peer: event.peer, value: 'Đang soạn' })
  state = reduce(state, {
    type: 'history',
    peer: event.peer,
    page: {
      content: [
        { ...event, status: 'pending', sequence: '2', name: 'Nam' },
        { ...event, id: 'older', time: 500, sequence: '1', name: 'Nam' },
      ],
      nextCursor: '1',
    },
  })
  const conversation = state[normalizePeer(event.peer)]
  assert.equal(conversation.messages.length, 2)
  assert.equal(conversation.messages[1].status, 'received')
  assert.equal(conversation.draft, 'Đang soạn')
  assert.equal(conversation.unread, 1)
  assert.equal(conversation.historyCursor, '1')
  assert.equal(conversation.historyLoaded, true)
})

test('restored pending means unknown result and history does not create unread notifications', () => {
  let state = reduce(
    {},
    {
      type: 'history-list',
      conversations: [
        {
          peer: event.peer,
          name: 'Nam',
          lastMessage: {
            ...event,
            direction: 'outgoing',
            status: 'pending',
            sequence: '1',
            name: 'Nam',
          },
        },
      ],
    },
  )
  const conversation = state[normalizePeer(event.peer)]
  assert.equal(conversation.messages[0].status, 'unknown')
  assert.equal(conversation.messages[0].historyState, 'saved')
  assert.equal(conversation.unread, 0)
  assert.equal(conversation.historyLoaded, undefined)
  state = reduce(state, {
    type: 'history',
    peer: event.peer,
    page: {
      content: [
        {
          ...event,
          direction: 'outgoing',
          status: 'accepted',
          sequence: '1',
          name: 'Nam',
        },
      ],
      nextCursor: null,
    },
  })
  assert.equal(state[normalizePeer(event.peer)].messages[0].status, 'accepted')
})
