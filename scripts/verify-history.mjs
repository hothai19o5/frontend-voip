import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createSipProxy } from './sip-test-proxy.mjs'

const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:15173'
const controlUrl =
  process.env.TEST_CONTROL_URL || 'http://127.0.0.1:14020/voip/__control'
const apiBase = controlUrl.replace('/__control', '/api/v1')
const output = new URL('../output/playwright/', import.meta.url)
await mkdir(output, { recursive: true })
const proxy = createSipProxy()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const ctx2 = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const page = await ctx.newPage(),
  peer = await ctx2.newPage()
const results = [],
  errors = []
for (const p of [page, peer])
  p.on('pageerror', (error) => errors.push(error.message))
let token, peerToken
const tick = () => new Promise((resolve) => setTimeout(resolve, 80))
async function until(test) {
  const start = Date.now()
  while (!(await test())) {
    if (Date.now() - start > 15000)
      throw new Error('History condition timed out')
    await tick()
  }
}
async function check(name, action) {
  await action()
  results.push(name)
  console.log(`PASS ${name}`)
}
async function control(body) {
  const response = await fetch(controlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
}
async function api(path, accessToken, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: body ? 'PUT' : 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  assert.equal(response.status, 200)
  return response.json()
}
async function login(p, username = 'alice') {
  await p.goto(`${base}/login`)
  await p.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await p.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
  const response = p.waitForResponse(
    (item) => item.url().endsWith('/auth/login') && item.status() === 200,
  )
  await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  const session = await (await response).json()
  await p.waitForURL('**/messages')
  await until(() =>
    proxy.accounts.has(`${session.user.sip.extension}@pbx.test`),
  )
  return session.accessToken
}
async function select(p, name) {
  await p
    .getByRole('button', { name: 'Hội thoại mới', exact: true })
    .first()
    .click()
  await p.locator('.person-option').filter({ hasText: name }).click()
  await p.getByRole('dialog').waitFor({ state: 'hidden' })
}
async function send(p, text) {
  await p.getByLabel('Nội dung tin nhắn', { exact: true }).fill(text)
  await p.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
  await until(
    async () =>
      (await p
        .getByLabel('Nội dung tin nhắn', { exact: true })
        .inputValue()) === '',
  )
}
async function logout(p) {
  await p.getByRole('button', { name: 'Menu tài khoản', exact: true }).click()
  await p.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click()
  await p.waitForURL('**/login')
}
const text = 'Lịch sử tiếng Việt 👋 <b>chỉ là văn bản</b>'
try {
  await control({ reset: true })
  token = await login(page)
  peerToken = await login(peer, 'member01')
  await check(
    'two-way SIP messages persist with final status and plain Unicode text',
    async () => {
      await select(page, 'Trần Hoàng Nam')
      await send(page, text)
      await peer.locator('.message-body').filter({ hasText: text }).waitFor()
      await send(peer, 'Đã nhận, cảm ơn bạn!')
      await page
        .locator('.incoming-message')
        .filter({ hasText: 'Đã nhận' })
        .waitFor()
      await until(async () => {
        const history = await api(
          '/message-history/messages?peer=sip:1002@pbx.test',
          token,
        )
        return (
          history.content.length === 2 &&
          history.content.some((m) => m.status === 'accepted')
        )
      })
      await until(
        async () =>
          (
            await api(
              '/message-history/messages?peer=sip:1001@pbx.test',
              peerToken,
            )
          ).content.length === 2,
      )
      assert.equal(await page.locator('.message-body b').count(), 0)
    },
  )
  await check(
    'reload and logout/login restore saved messages while drafts stay temporary',
    async () => {
      await page
        .getByLabel('Nội dung tin nhắn', { exact: true })
        .fill('Bản nháp không lưu')
      await page.reload()
      await page.waitForURL('**/login')
      token = await login(page)
      await page.locator('.message-body').filter({ hasText: text }).waitFor()
      assert.equal(await page.locator('.chat-message').count(), 2)
      assert.equal(
        await page
          .getByLabel('Nội dung tin nhắn', { exact: true })
          .inputValue(),
        '',
      )
      await logout(page)
      token = await login(page)
      await page.locator('.message-body').filter({ hasText: text }).waitFor()
      assert.equal(await page.locator('.chat-message').count(), 2)
      const third = await ctx.newPage()
      await login(third, 'member02')
      await third
        .getByText('Đang tải hội thoại…', { exact: true })
        .waitFor({ state: 'hidden' })
      assert.equal(await third.locator('.conversation-item').count(), 0)
      await third.close()
      await until(() => !proxy.accounts.has('1003@pbx.test'))
    },
  )
  await check(
    'failed history writes are visible and retry without duplicate SIP sends or registration',
    async () => {
      await control({ historyWriteError: true })
      await send(page, 'Tin cần thử lại lưu lịch sử')
      await page
        .getByRole('button', { name: 'Thử lại lưu lịch sử', exact: true })
        .waitFor()
      const messages = proxy.stats.messages,
        connections = proxy.stats.connections
      await control({ historyWriteError: false })
      await page
        .getByRole('button', { name: 'Thử lại lưu lịch sử', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Thử lại lưu lịch sử', exact: true })
        .waitFor({ state: 'hidden' })
      await until(
        async () =>
          (await api('/message-history/messages?peer=sip:1002@pbx.test', token))
            .content.length === 3,
      )
      assert.equal(proxy.stats.messages, messages)
      assert.equal(proxy.stats.connections, connections)
    },
  )
  await check(
    'conversation and message pages load older entries without loss or duplicates',
    async () => {
      for (let i = 0; i < 61; i++)
        await api(`/message-history/messages/seed-${i}`, token, {
          account: 'sip:1001@pbx.test',
          peer: 'sip:1003@pbx.test',
          name: 'Lê Phương Linh',
          direction: 'incoming',
          body: `Tin cũ ${i}`,
          status: 'received',
          time: 1700000000000 + i,
        })
      for (let i = 0; i < 32; i++)
        await api(`/message-history/messages/conversation-${i}`, token, {
          account: 'sip:1001@pbx.test',
          peer: `sip:${2000 + i}@pbx.test`,
          name: `Hội thoại ${i}`,
          direction: 'incoming',
          body: `Nội dung ${i}`,
          status: 'received',
          time: 1700000100000 + i,
        })
      await logout(page)
      token = await login(page)
      await page
        .getByRole('button', { name: 'Tải hội thoại cũ hơn', exact: true })
        .click()
      await page
        .locator('.conversation-item')
        .filter({ hasText: 'Lê Phương Linh' })
        .click()
      await until(
        async () => (await page.locator('.chat-message').count()) === 50,
      )
      await page
        .getByRole('button', { name: 'Tải tin nhắn cũ hơn', exact: true })
        .click()
      await until(
        async () => (await page.locator('.chat-message').count()) === 61,
      )
      assert.equal(
        new Set(await page.locator('.message-body').allTextContents()).size,
        61,
      )
      await page
        .getByRole('button', { name: 'Tải tin nhắn cũ hơn', exact: true })
        .waitFor({ state: 'hidden' })
      assert.equal(await page.locator('.conversation-item').count(), 34)
    },
  )
  await check(
    'history GET failures offer retry and leave SIP usable',
    async () => {
      await control({ historyReadError: true })
      await logout(page)
      token = await login(page)
      await page
        .getByRole('button', { name: 'Thử lại tải hội thoại', exact: true })
        .waitFor()
      assert.equal(
        await page.getByText('Chưa có đoạn chat', { exact: true }).count(),
        0,
      )
      const registrations = proxy.stats.registrations
      await control({ historyReadError: false })
      await page
        .getByRole('button', { name: 'Thử lại tải hội thoại', exact: true })
        .click()
      await until(
        async () => (await page.locator('.conversation-item').count()) === 30,
      )
      assert.equal(proxy.stats.registrations, registrations)
    },
  )
  await check(
    'late history snapshot merges with live messages and keeps the current draft',
    async () => {
      let release, captured
      const snapshot = new Promise((resolve) => {
        captured = resolve
      })
      await page.route(
        '**/api/v1/message-history/messages?*',
        async (route) => {
          const response = await route.fetch()
          await new Promise((resolve) => {
            release = resolve
            captured()
          })
          await route.fulfill({ response })
        },
        { times: 1 },
      )
      await select(page, 'Trần Hoàng Nam')
      await snapshot
      await page
        .getByLabel('Nội dung tin nhắn', { exact: true })
        .fill('Giữ bản nháp hiện tại')
      await send(peer, 'Tin đến trong khi tải lịch sử')
      await page
        .locator('.message-body')
        .filter({ hasText: 'Tin đến trong khi tải lịch sử' })
        .waitFor()
      release()
      await page
        .getByText('Đang tải tin nhắn…', { exact: true })
        .waitFor({ state: 'hidden' })
      assert.equal(
        await page
          .getByLabel('Nội dung tin nhắn', { exact: true })
          .inputValue(),
        'Giữ bản nháp hiện tại',
      )
      const bodies = await page.locator('.message-body').allTextContents()
      assert.equal(bodies.length, 4)
      assert.equal(new Set(bodies).size, 4)
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      )
      await page.screenshot({
        path: new URL('message-history-1440.png', output).pathname.replace(
          /^\/(\w:)/,
          '$1',
        ),
        fullPage: true,
      })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
      await page.screenshot({
        path: new URL('message-history-390.png', output).pathname.replace(
          /^\/(\w:)/,
          '$1',
        ),
        fullPage: true,
      })
    },
  )
  assert.deepEqual(errors, [])
  await writeFile(
    new URL('message-history-results.json', output),
    JSON.stringify(
      { results, errors, sip: proxy.stats, liveBackend: false },
      null,
      2,
    ),
  )
} catch (error) {
  await page
    .screenshot({
      path: new URL('message-history-failure.png', output).pathname.replace(
        /^\/(\w:)/,
        '$1',
      ),
      fullPage: true,
    })
    .catch(() => {})
  throw error
} finally {
  await browser.close()
  await proxy.close()
}
