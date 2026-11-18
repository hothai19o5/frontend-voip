import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createSipProxy } from './sip-test-proxy.mjs'

const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:15173'
const controlUrl =
  process.env.TEST_CONTROL_URL || 'http://127.0.0.1:14020/voip/__control'
const output = new URL('../output/playwright/', import.meta.url)
await mkdir(output, { recursive: true })
const proxy = createSipProxy()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const contexts = await Promise.all([
  browser.newContext({ viewport: { width: 1440, height: 900 } }),
  browser.newContext(),
])
const page = await contexts[0].newPage(),
  peer = await contexts[1].newPage()
const results = [],
  errors = []
for (const p of [page, peer])
  p.on('pageerror', (error) => errors.push(error.message))
let token
const draft = (p = page) => p.getByLabel('Nội dung tin nhắn', { exact: true })
const picker = (p = page) =>
  p.getByRole('dialog', { name: 'Biểu cảm và sticker', exact: true })
async function until(test) {
  const start = Date.now()
  while (!(await test())) {
    if (Date.now() - start > 15000)
      throw new Error('Expression condition timed out')
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
}
async function check(name, action) {
  await action()
  results.push(name)
  console.log(`PASS ${name}`)
}
async function login(p, username = 'alice') {
  await p.goto(`${base}/login`)
  await p.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await p.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
  const response = p.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.status() === 200,
  )
  await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  const session = await (await response).json()
  await p.waitForURL('**/messages')
  await until(() =>
    proxy.accounts.has(`${session.user.sip.extension}@pbx.test`),
  )
  return session.accessToken
}
async function select(name) {
  await page
    .getByRole('button', { name: 'Hội thoại mới', exact: true })
    .first()
    .click()
  await page.locator('.person-option').filter({ hasText: name }).click()
  await page
    .getByRole('dialog', { name: 'Hội thoại mới', exact: true })
    .waitFor({ state: 'hidden' })
}
async function open(p = page, tab = 'Emoji') {
  await p.getByRole('button', { name: 'Chọn biểu cảm', exact: true }).click()
  await picker(p).waitFor()
  await picker(p).getByRole('tab', { name: tab, exact: true }).click()
}
async function send(p = page) {
  await p.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
  await until(async () => (await draft(p).inputValue()) === '')
}
async function shot(name) {
  await page.screenshot({
    path: new URL(name, output).pathname.replace(/^\/(\w:)/, '$1'),
    fullPage: true,
  })
}
async function savedMessages() {
  const response = await fetch(
    controlUrl.replace(
      '/__control',
      '/api/v1/message-history/messages?peer=sip:1002@pbx.test',
    ),
    { headers: { Authorization: `Bearer ${token}` } },
  )
  assert.equal(response.status, 200)
  return (await response.json()).content
}
try {
  await fetch(controlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset: true }),
  })
  token = await login(page)
  await login(peer, 'member01')
  await select('Trần Hoàng Nam')
  const connections = proxy.stats.connections
  await check(
    'emoji insertion replaces selection, restores focus/caret and sends once over SIP',
    async () => {
      await draft().fill('A B')
      await draft().evaluate((element) => element.setSelectionRange(2, 3))
      await open()
      await picker()
        .getByRole('button', { name: 'Chèn Mỉm cười', exact: true })
        .click()
      await picker().waitFor({ state: 'hidden' })
      await until(() => draft().evaluate((e) => document.activeElement === e))
      assert.equal(await draft().inputValue(), 'A 😊')
      assert.equal(await draft().evaluate((e) => e.selectionStart), 4)
      await send()
      await peer.locator('.message-body').filter({ hasText: 'A 😊' }).waitFor()
      assert.equal(proxy.stats.messages, 1)
    },
  )
  await check(
    'search supports Vietnamese without accents, emotes and keyboard dismissal',
    async () => {
      await open()
      await picker().getByLabel('Tìm biểu cảm').fill('cuoi ra nuoc mat')
      assert.equal(await picker().locator('.emoji-option').count(), 1)
      await picker()
        .getByRole('button', { name: 'Chèn Cười ra nước mắt', exact: true })
        .click()
      assert.equal(await draft().inputValue(), '😂')
      await open(page, 'Emote')
      await picker()
        .getByRole('button', { name: 'Chèn emote Ôm bạn', exact: true })
        .click()
      assert.equal(await draft().inputValue(), '😂(づ｡◕‿‿◕｡)づ')
      await open()
      await picker().getByLabel('Tìm biểu cảm').fill('khong tim thay 123')
      await picker().getByText('Không tìm thấy emoji.').waitFor()
      await page.keyboard.press('Escape')
      await picker().waitFor({ state: 'hidden' })
      await until(() =>
        page
          .getByRole('button', { name: 'Chọn biểu cảm', exact: true })
          .evaluate((e) => document.activeElement === e),
      )
      await send()
      await peer
        .locator('.message-body')
        .filter({ hasText: '(づ｡◕‿‿◕｡)づ' })
        .waitFor()
    },
  )
  await check(
    'stickers send in both directions, preserve draft and render local art with clean previews',
    async () => {
      await draft().fill('Giữ nguyên bản nháp')
      await open(page, 'Sticker')
      await picker()
        .getByRole('button', { name: 'Gửi sticker Xin chào', exact: true })
        .click()
      await picker().waitFor({ state: 'hidden' })
      await page
        .locator('.outgoing-message')
        .getByRole('img', { name: 'Sticker Xin chào', exact: true })
        .waitFor()
      await peer
        .getByRole('img', { name: 'Sticker Xin chào', exact: true })
        .waitFor()
      assert.equal(await draft().inputValue(), 'Giữ nguyên bản nháp')
      await open(peer, 'Sticker')
      await picker(peer)
        .getByRole('button', { name: 'Gửi sticker Yêu thương', exact: true })
        .click()
      await picker(peer).waitFor({ state: 'hidden' })
      await page
        .locator('.incoming-message')
        .getByRole('img', { name: 'Sticker Yêu thương', exact: true })
        .waitFor()
      assert.match(
        await page.locator('.conversation-preview').first().innerText(),
        /Bản nháp: Giữ nguyên/,
      )
      await draft().fill('')
      assert.match(
        await page.locator('.conversation-preview').first().innerText(),
        /Sticker · Yêu thương/,
      )
      const art = page.getByRole('img', {
        name: 'Sticker Yêu thương',
        exact: true,
      })
      assert.equal(
        await art.evaluate(async (element) => {
          const source = getComputedStyle(element).backgroundImage.slice(5, -2)
          const image = new Image()
          image.src = source
          await image.decode()
          return image.naturalWidth === 1536 && image.naturalHeight === 1024
        }),
        true,
      )
      assert.equal(proxy.stats.connections, connections)
    },
  )
  await check(
    'sticker bodies survive history reload and unsupported versions stay visible as text',
    async () => {
      await until(
        async () =>
          (await savedMessages()).filter((m) =>
            m.body.startsWith('[[voip:sticker:v1:'),
          ).length === 2,
      )
      await page.reload()
      await page.waitForURL('**/login')
      token = await login(page)
      await page
        .getByRole('img', { name: 'Sticker Xin chào', exact: true })
        .waitFor()
      await page
        .getByRole('img', { name: 'Sticker Yêu thương', exact: true })
        .waitFor()
      await draft(peer).fill(
        '[[voip:sticker:v2:remote]] <img src=x onerror=alert(1)>',
      )
      await send(peer)
      await page
        .locator('.message-body')
        .filter({ hasText: '[[voip:sticker:v2:remote]]' })
        .waitFor()
      assert.equal(await page.locator('.message-body img').count(), 0)
      assert.equal(await page.locator('.sticker-message').count(), 2)
    },
  )
  await check(
    'mock image/file buttons explain availability without opening uploads or sending SIP',
    async () => {
      const count = proxy.stats.messages
      let chooser = false
      page.on('filechooser', () => {
        chooser = true
      })
      await page
        .getByRole('button', { name: 'Gửi ảnh (chưa hỗ trợ)', exact: true })
        .click()
      await page
        .locator('.toast')
        .filter({ hasText: 'Chức năng gửi ảnh sẽ được bổ sung sau.' })
        .waitFor()
      await page
        .getByRole('button', { name: 'Gửi file (chưa hỗ trợ)', exact: true })
        .click()
      await page
        .locator('.toast')
        .filter({ hasText: 'Chức năng gửi file sẽ được bổ sung sau.' })
        .waitFor()
      assert.equal(chooser, false)
      assert.equal(await page.locator('input[type=file]').count(), 0)
      assert.equal(proxy.stats.messages, count)
    },
  )
  await check(
    'picker fits 1440/1024/768/390, supports tabs and has visible sticker art',
    async () => {
      for (const [width, height] of [
        [1440, 900],
        [1024, 768],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height })
        if (width === 390)
          await page.locator('.conversation-item').first().click()
        await open(page, 'Sticker')
        const box = await picker().boundingBox()
        assert.ok(
          box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= width &&
            box.y + box.height <= height,
        )
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
        await shot(`expressions-stickers-${width}.png`)
        await picker().getByRole('tab', { name: 'Emoji', exact: true }).click()
        await shot(`expressions-emoji-${width}.png`)
        await page.keyboard.press('Escape')
      }
    },
  )
  await check(
    'failed sticker send keeps the picker and draft available for retry',
    async () => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await select('Lê Phương Linh')
      await draft().fill('Không mất bản nháp')
      await open(page, 'Sticker')
      await picker()
        .getByRole('button', { name: 'Gửi sticker Cảm ơn', exact: true })
        .click()
      await page
        .locator('.message-delivery[aria-label="Gửi thất bại"]')
        .waitFor()
      await until(() =>
        picker()
          .getByRole('button', { name: 'Gửi sticker Cảm ơn', exact: true })
          .isEnabled(),
      )
      assert.equal(await picker().isVisible(), true)
      assert.equal(await draft().inputValue(), 'Không mất bản nháp')
    },
  )
  assert.deepEqual(errors, [])
  await writeFile(
    new URL('expressions-results.json', output),
    JSON.stringify(
      { results, errors, sip: proxy.stats, livePbxVerified: false },
      null,
      2,
    ),
  )
} catch (error) {
  await shot('expressions-failure.png').catch(() => {})
  throw error
} finally {
  await browser.close()
  await proxy.close()
}
