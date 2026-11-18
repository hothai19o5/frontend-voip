import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = await readFile(
  new URL('../src/features/messages/history-writer.ts', import.meta.url),
  'utf8',
)
const { HistoryWriter } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
)
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('acknowledgment queued during a pending write is saved afterward', async () => {
  let release
  const saved = [],
    results = []
  const writer = new HistoryWriter(
    async (id, message) => {
      saved.push([id, message.status])
      if (saved.length === 1)
        await new Promise((resolve) => {
          release = resolve
        })
    },
    (...args) => results.push(args),
    () => assert.fail('Unexpected failure'),
  )
  writer.enqueue('one', { status: 'pending' })
  writer.enqueue('one', { status: 'accepted' })
  release()
  await tick()
  assert.deepEqual(saved, [
    ['one', 'pending'],
    ['one', 'accepted'],
  ])
  assert.equal(results.filter(([, status]) => status === 'saved').length, 1)
})

test('failed/ambiguous write retains latest message and retries with the same id', async () => {
  let fail = true,
    failures = 0
  const writes = [],
    results = []
  const writer = new HistoryWriter(
    async (...args) => {
      writes.push(args)
      if (fail) throw new Error('offline after write')
    },
    (...args) => results.push(args),
    () => {
      failures++
    },
  )
  writer.enqueue('same-id', { body: 'hello', status: 'accepted' })
  await tick()
  assert.equal(failures, 1)
  assert.deepEqual(results.at(-1), ['same-id', 'failed'])
  fail = false
  writer.retry()
  await tick()
  assert.deepEqual(writes[0], writes[1])
  assert.deepEqual(results.at(-1), ['same-id', 'saved'])
  writer.retry()
  await tick()
  assert.equal(writes.length, 2)
})

test('logout stops the old queue and ignores late completions', async () => {
  let release
  const saved = [],
    results = []
  const writer = new HistoryWriter(
    async (id) => {
      saved.push(id)
      await new Promise((resolve) => {
        release = resolve
      })
    },
    (...args) => results.push(args),
    () => assert.fail('Unexpected failure'),
  )
  writer.enqueue('one', { status: 'pending' })
  writer.enqueue('two', { status: 'received' })
  writer.stop()
  release()
  await tick()
  assert.deepEqual(saved, ['one'])
  assert.equal(
    results.some(([, status]) => status === 'saved'),
    false,
  )
})
