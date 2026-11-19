import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = stripTypeScriptTypes(
  await readFile(new URL('../src/lib/local-id.ts', import.meta.url), 'utf8'),
)

function load(globals) {
  return runInNewContext(
    source.replace('export function', 'function') + '\ncreateLocalId',
    { Date: { now: () => 12345 }, ...globals },
  )
}

test('HTTP LAN context: IDs remain unique with no randomUUID and a fixed clock', () => {
  const createId = load({ crypto: {} })
  const ids = Array.from({ length: 1000 }, () => createId())
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0))
})

test('ID generation also works without a crypto object', () => {
  const createId = load({})
  assert.notEqual(createId(), createId())
})

test('native randomUUID is used when available with its crypto receiver', () => {
  const crypto = {
    randomUUID() {
      assert.equal(this, crypto)
      return 'native-id'
    },
  }
  assert.equal(load({ crypto })(), 'native-id')
})
