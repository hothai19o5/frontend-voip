import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

async function moduleAt(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
  )
}
const {
  STICKERS,
  stickerBody,
  parseSticker,
  messagePreview,
  insertExpression,
  isEmojiOnly,
} = await moduleAt('../src/features/messages/message-content.ts')
const { expressionSearch } = await moduleAt(
  '../src/features/messages/expression-catalog.ts',
)

test('known stickers round-trip unchanged through text transport and history JSON', () => {
  for (const sticker of STICKERS) {
    const saved = JSON.parse(JSON.stringify({ body: stickerBody(sticker) }))
    assert.equal(parseSticker(saved.body), sticker)
    assert.equal(messagePreview(saved.body), `Sticker · ${sticker.label}`)
    assert.ok(saved.body.includes(sticker.fallback))
  }
})

test('unknown, altered and external sticker payloads remain plain text', () => {
  for (const body of [
    '[[voip:sticker:v2:wave]] 👋 Xin chào!',
    '[[voip:sticker:v1:remote]] https://example.com/tracker.png',
    '[[voip:sticker:v1:wave]] <img src=x onerror=alert(1)>',
    stickerBody(STICKERS[0]) + ' other text',
    'hello ' + stickerBody(STICKERS[0]),
  ]) {
    assert.equal(parseSticker(body), undefined)
    assert.equal(messagePreview(body), body)
  }
})

test('inserting Unicode replaces selected text, returns the caret and respects draft limit', () => {
  assert.deepEqual(insertExpression('A B', '😊', 2, 3), {
    value: 'A 😊',
    caret: 4,
  })
  assert.deepEqual(insertExpression('Xin chào!', '(づ｡◕‿‿◕｡)づ', 8, 8), {
    value: 'Xin chào(づ｡◕‿‿◕｡)づ!',
    caret: 8 + '(づ｡◕‿‿◕｡)づ'.length,
  })
  assert.equal(insertExpression('a'.repeat(4999), '😊', 4999, 4999), null)
  assert.equal(
    insertExpression('a'.repeat(5000), '😊', 0, 2)?.value.length,
    5000,
  )
  assert.deepEqual(insertExpression('abc', '👍', -4, 99), {
    value: '👍',
    caret: 2,
  })
})

test('emoji-only styling handles skin tones, flags, families and keycaps without treating text as emoji', () => {
  for (const value of ['😊', '👍🏽', '👨‍👩‍👧‍👦', '🇻🇳', '1️⃣', '❤️ 👋'])
    assert.equal(isEmojiOnly(value), true, value)
  for (const value of ['', 'hello 😊', '123', '(^_^)', '😊'.repeat(7)])
    assert.equal(isEmojiOnly(value), false, value)
  assert.equal(expressionSearch('Cảm ơn bạn 🙏', 'cam on'), true)
  assert.equal(expressionSearch('Đồng ý 👍', 'dong y'), true)
})
