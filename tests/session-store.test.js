import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Compile this dependency-free store in memory, without adding a runtime TS loader.
const source = await readFile(
  new URL('../src/features/auth/session-store.ts', import.meta.url),
  'utf8',
)
const code = stripTypeScriptTypes(source)
const { sessionStore: store } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
)
const session = (
  token,
  expiresAt = new Date(Date.now() + 60000).toISOString(),
) => ({
  accessToken: token,
  expiresAt,
  tokenType: 'Bearer',
  user: { id: token },
})

test('a stale unauthorized response cannot expire a newer login', () => {
  store.start(session('first'))
  store.start(session('second'))
  store.expire('first')
  assert.equal(store.getSnapshot().session.accessToken, 'second')
  store.expire('second')
  assert.equal(store.getSnapshot().session, null)
  assert.match(store.getSnapshot().notice, /hết hạn/)
})

test('expiry invalidates the current identity, with subscriber cleanup', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 10000 })
  let notifications = 0
  const unsubscribe = store.subscribe(() => {
    notifications++
  })
  store.start(session('token', new Date(11000).toISOString()))
  store.checkExpiry()
  assert.equal(store.getSnapshot().session.accessToken, 'token')
  t.mock.timers.tick(1000)
  store.checkExpiry()
  assert.equal(store.getSnapshot().session, null)
  assert.equal(notifications, 2)
  unsubscribe()
  store.end()
  assert.equal(notifications, 2)
})

test('expired and malformed sessions are rejected before entering the app', () => {
  assert.throws(() => store.start(session('bad', 'invalid')))
  assert.throws(() =>
    store.start(session('expired', new Date(0).toISOString())),
  )
  assert.equal(store.getSnapshot().session, null)
})
