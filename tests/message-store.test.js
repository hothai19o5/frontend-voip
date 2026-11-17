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
