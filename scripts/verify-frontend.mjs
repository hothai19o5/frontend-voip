import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createSipProxy } from './sip-test-proxy.mjs'

const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5173'
const controlUrl =
  process.env.TEST_CONTROL_URL || 'http://127.0.0.1:14020/voip/__control'
const output = new URL('../output/playwright/', import.meta.url)
await mkdir(output, { recursive: true })
const proxy = createSipProxy()
const browser = await chromium
  .launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  .catch(async (error) => {
    await proxy.close()
    throw error
  })
const results = [],
  errors = []
const contextOptions = {
  viewport: { width: 1577, height: 931 },
  permissions: ['microphone', 'camera'],
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
async function until(test, timeout = 15000) {
  const start = Date.now()
  while (!(await test())) {
    if (Date.now() - start > timeout) throw new Error('Condition timed out')
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(180)
  await page.screenshot({
    path: new URL(name, output).pathname.replace(/^\/(\w:)/, '$1'),
    fullPage: true,
  })
}
async function logout(page) {
  await page
    .getByRole('button', { name: 'Menu tài khoản', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click()
  await page.waitForURL('**/login')
}
async function login(page, username = 'alice', ready = true) {
  await page.goto(`${base}/login`)
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith('/api/v1/auth/login') && item.status() === 200,
  )
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  const session = await (await response).json()
  await page.waitForURL('**/messages')
  await page.getByRole('heading', { name: 'Đoạn chat', exact: true }).waitFor()
  if (ready)
    await until(() =>
      proxy.accounts.has(`${session.user.sip.extension}@pbx.test`),
    )
  return session.accessToken
}
async function selectPerson(page, name = 'Trần Hoàng Nam') {
  await page
    .getByRole('button', { name: 'Hội thoại mới', exact: true })
    .first()
    .click()
  await page.locator('.person-option').filter({ hasText: name }).click()
  await page
    .getByRole('dialog', { name: 'Hội thoại mới', exact: true })
    .waitFor({ state: 'hidden' })
  await page.locator('.thread-identity h2').filter({ hasText: name }).waitFor()
}
async function send(page, body) {
  await page.getByLabel('Nội dung tin nhắn', { exact: true }).fill(body)
  await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
}
async function connected(page) {
  await until(
    () =>
      page.getByRole('button', { name: 'Tắt mic', exact: true }).isEnabled(),
    25000,
  )
}
// This suite covers the inline fallback when automatic popups are blocked.
// verify-call-window.mjs separately exercises real detached windows.
async function inlineContext() {
  const context = await browser.newContext(contextOptions)
  await context.addInitScript(() => { window.open = () => null })
  return context
}
const ctx = await inlineContext()
const page = await ctx.newPage()
page.on('pageerror', (error) => errors.push(error.message))
let peer
try {
  await control({ reset: true })
  await check(
    'protected routes and auth layouts at 1440/1024/768/390',
    async () => {
      await page.goto(`${base}/messages`)
      await page.waitForURL('**/login')
      for (const [width, height] of [
        [1440, 1000],
        [1024, 768],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height })
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        await shot(page, `login-${width}.png`)
      }
      await page.setViewportSize(contextOptions.viewport)
    },
  )
  await check(
    'auth errors and registration outcomes are toasts, not banners',
    async () => {
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill('alice')
      await page.getByLabel('Mật khẩu', { exact: true }).fill('wrong-password')
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await page
        .locator('.toast-error')
        .filter({ hasText: 'không đúng' })
        .waitFor()
      assert.equal(await page.locator('.notice, .global-notice').count(), 0)
      await page.getByRole('link', { name: 'Đăng ký', exact: true }).click()
      await page
        .getByLabel('Tên hiển thị', { exact: true })
        .fill('Tài khoản kiểm thử')
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill('alice')
      await page
        .getByLabel('Địa chỉ email', { exact: true })
        .fill('new@example.test')
      await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
      await page
        .getByRole('button', { name: 'Tạo tài khoản', exact: true })
        .click()
      await page
        .locator('.toast-error')
        .filter({ hasText: 'Tên đăng nhập đã' })
        .waitFor()
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill('new_user')
      await page
        .getByRole('button', { name: 'Tạo tài khoản', exact: true })
        .click()
      await page.waitForURL('**/login')
      await page.locator('.toast-success').waitFor()
      await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await page.waitForURL('**/messages')
      await logout(page)
    },
  )
  await login(page)
  await check(
    'full viewport Messenger islands with no outer frame, headers, footers or technical navigation',
    async () => {
      assert.equal(
        await page
          .locator(
            '.workspace-header, .workspace-footer, .sip-card, .conversation-session-note, .global-notice',
          )
          .count(),
        0,
      )
      assert.equal(await page.locator('.main-nav a').count(), 1)
      assert.equal(await page.locator('.island').count(), 3)
      const bounds = await page.locator('.app-screen').boundingBox()
      assert.equal(bounds.x, 0)
      assert.equal(bounds.y, 0)
      assert.equal(bounds.width, 1577)
      assert.equal(bounds.height, 931)
      await shot(page, 'messages-empty-1577.png')
    },
  )
  await check(
    'avatar account menu, read-only profile and sidebar collapse/expand',
    async () => {
      const initial = await page.locator('.app-sidebar').boundingBox()
      await page
        .getByRole('button', { name: 'Mở rộng sidebar', exact: true })
        .click()
      const expanded = await page.locator('.app-sidebar').boundingBox()
      assert.ok(expanded.width > initial.width + 100)
      await page
        .getByRole('button', { name: 'Menu tài khoản', exact: true })
        .click()
      await shot(page, 'account-menu-1577.png')
      await page
        .getByRole('menuitem', { name: 'Thông tin tài khoản', exact: true })
        .click()
      const dialog = page.getByRole('dialog', {
        name: 'Thông tin tài khoản',
        exact: true,
      })
      await dialog.getByText('alice@example.test', { exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await page
        .getByRole('button', { name: 'Thu gọn sidebar', exact: true })
        .click()
    },
  )
  await check(
    'new-conversation picker preserves search, paging, blocked users and retry with toast errors',
    async () => {
      await page
        .getByRole('button', { name: 'Hội thoại mới', exact: true })
        .first()
        .click()
      const dialog = page.getByRole('dialog', {
        name: 'Hội thoại mới',
        exact: true,
      })
      await until(
        async () => (await dialog.locator('.person-option').count()) === 10,
      )
      assert.equal(
        await dialog
          .locator('.person-option')
          .filter({ hasText: 'Nguyễn Minh Anh' })
          .count(),
        0,
      )
      assert.equal(
        await dialog
          .locator('.person-option')
          .filter({ hasText: 'Vũ Minh Khang' })
          .isDisabled(),
        true,
      )
      await dialog
        .getByRole('button', { name: 'Trang sau', exact: true })
        .click()
      await until(
        async () => (await dialog.locator('.person-option').count()) === 3,
      )
      await dialog
        .getByLabel('Tìm người dùng', { exact: true })
        .fill('Phương Linh')
      await until(
        async () => (await dialog.locator('.person-option').count()) === 1,
      )
      await dialog
        .getByLabel('Tìm người dùng', { exact: true })
        .fill('nobody-matches')
      await dialog
        .getByRole('heading', { name: 'Không tìm thấy người dùng' })
        .waitFor()
      await dialog.getByLabel('Tìm người dùng', { exact: true }).fill('')
      await until(
        async () => (await dialog.locator('.person-option').count()) === 10,
      )
      await control({ directoryError: true })
      await dialog.getByRole('button', { name: 'Tải lại danh sách' }).click()
      await page
        .locator('.toast-error')
        .filter({ hasText: 'tạm thời không khả dụng' })
        .waitFor()
      await control({ directoryError: false })
      await dialog.getByRole('button', { name: 'Thử lại', exact: true }).click()
      await dialog
        .locator('.person-option')
        .filter({ hasText: 'Trần Hoàng Nam' })
        .click()
      await dialog.waitFor({ state: 'hidden' })
    },
  )
  const ctx2 = await inlineContext()
  peer = await ctx2.newPage()
  peer.on('pageerror', (error) => errors.push(error.message))
  await login(peer, 'member01')
  await check(
    'two-way SIP MESSAGE, unread state, plain-text rendering and draft preservation',
    async () => {
      await peer
        .getByRole('button', { name: 'Hội thoại mới', exact: true })
        .first()
        .click()
      await page.bringToFront()
      await send(page, 'Chào Nam, mình trao đổi một chút nhé?')
      await page.locator('.delivery-accepted').waitFor()
      await until(() => peer.locator('.nav-unread').isVisible())
      await peer.bringToFront()
      await peer.keyboard.press('Escape')
      await peer
        .getByRole('log', { name: 'Tin nhắn', exact: true })
        .getByText('Chào Nam, mình trao đổi một chút nhé?', { exact: true })
        .waitFor()
      await send(peer, 'Được chứ. Mình đang sẵn sàng, bạn gọi nhé.')
      await page
        .getByRole('log', { name: 'Tin nhắn', exact: true })
        .getByText('Được chứ. Mình đang sẵn sàng, bạn gọi nhé.', {
          exact: true,
        })
        .waitFor()
      await page
        .getByLabel('Nội dung tin nhắn', { exact: true })
        .fill('Bản nháp được giữ')
      const connections = proxy.stats.connections
      await page
        .getByRole('button', { name: 'Hội thoại mới', exact: true })
        .click()
      await page.keyboard.press('Escape')
      await page
        .getByRole('button', { name: 'Mở rộng sidebar', exact: true })
        .click()
      assert.equal(
        await page
          .getByLabel('Nội dung tin nhắn', { exact: true })
          .inputValue(),
        'Bản nháp được giữ',
      )
      assert.equal(proxy.stats.connections, connections)
      await page
        .getByRole('button', { name: 'Thu gọn sidebar', exact: true })
        .click()
      await send(page, 'Mình gọi video sau nhé. <b>Đây là văn bản.</b>')
      await peer
        .getByRole('log', { name: 'Tin nhắn', exact: true })
        .getByText('Mình gọi video sau nhé. <b>Đây là văn bản.</b>', {
          exact: true,
        })
        .waitFor()
      assert.equal(await peer.locator('.message-body b').count(), 0)
    },
  )
  await check(
    'send failure is a toast and retains the unsent draft',
    async () => {
      await selectPerson(page, 'Lê Phương Linh')
      await send(page, 'Tin chưa gửi được')
      await page.locator('.delivery-failed').waitFor()
      await page
        .locator('.toast-error')
        .filter({ hasText: 'không thể liên lạc' })
        .waitFor()
      assert.equal(
        await page
          .getByLabel('Nội dung tin nhắn', { exact: true })
          .inputValue(),
        'Tin chưa gửi được',
      )
      await page
        .locator('.conversation-item')
        .filter({ hasText: 'Trần Hoàng Nam' })
        .click()
    },
  )
  await check(
    'islands, shared-content panels and mobile list/thread/profile behavior',
    async () => {
      await page.getByText('File đã chia sẻ', { exact: true }).click()
      await page
        .getByText('Chưa có file được chia sẻ.', { exact: true })
        .waitFor()
      for (const [width, height] of [
        [1577, 931],
        [1440, 900],
        [1024, 768],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height })
        await page.waitForTimeout(100)
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `overflow at ${width}`,
        )
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight,
          ),
          true,
          `vertical page overflow at ${width}`,
        )
        await shot(page, `messages-${width}.png`)
      }
      await page
        .getByRole('button', { name: 'Thông tin hội thoại', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Đóng hồ sơ', exact: true })
        .click()
      await page
        .getByRole('button', {
          name: 'Trở về danh sách hội thoại',
          exact: true,
        })
        .click()
      await page
        .getByRole('heading', { name: 'Đoạn chat', exact: true })
        .waitFor()
      await shot(page, 'messages-list-390.png')
      await page
        .locator('.conversation-item')
        .filter({ hasText: 'Trần Hoàng Nam' })
        .click()
      await page.setViewportSize(contextOptions.viewport)
      await page
        .getByRole('button', { name: 'Thông tin hội thoại', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Mở rộng sidebar', exact: true })
        .click()
      await shot(page, 'messages-expanded-1577.png')
      await page
        .getByRole('button', { name: 'Thu gọn sidebar', exact: true })
        .click()
    },
  )
  await check(
    'voice calls, incoming answer, microphone and media cleanup survive opening menus',
    async () => {
      await page
        .getByRole('button', { name: 'Gọi thoại từ hội thoại', exact: true })
        .click()
      await peer.getByRole('button', { name: 'Trả lời', exact: true }).click()
      await connected(page)
      await connected(peer)
      await until(() =>
        page.evaluate(
          () =>
            document.querySelector('audio').srcObject?.getAudioTracks().length >
            0,
        ),
      )
      await page.getByRole('button', { name: 'Tắt mic', exact: true }).click()
      await page.getByRole('button', { name: 'Bật mic', exact: true }).waitFor()
      const connections = proxy.stats.connections
      await page
        .getByRole('button', { name: 'Hội thoại mới', exact: true })
        .click()
      await page.keyboard.press('Escape')
      assert.equal(proxy.stats.connections, connections)
      await shot(page, 'voice-call-1577.png')
      await peer
        .getByRole('button', { name: 'Kết thúc cuộc gọi', exact: true })
        .click()
      await until(() => page.locator('.call-panel').isHidden())
      assert.equal(
        await page.evaluate(() => document.querySelector('audio').srcObject),
        null,
      )
    },
  )
  await check(
    'incoming decline and outgoing cancellation clear both call panels',
    async () => {
      await page
        .getByRole('button', { name: 'Gọi thoại từ hội thoại', exact: true })
        .click()
      await peer.getByRole('button', { name: 'Từ chối', exact: true }).click()
      await until(() => page.locator('.call-panel').isHidden())
      await page
        .getByRole('button', { name: 'Gọi thoại từ hội thoại', exact: true })
        .click()
      await peer.getByRole('button', { name: 'Trả lời', exact: true }).waitFor()
      await page
        .getByRole('button', { name: 'Hủy cuộc gọi', exact: true })
        .click()
      await until(() => peer.locator('.call-panel').isHidden())
      await until(() => page.locator('.call-panel').isHidden())
    },
  )
  await check('video media and camera controls', async () => {
    await page
      .getByRole('button', { name: 'Gọi video từ hội thoại', exact: true })
      .click()
    await peer.getByRole('button', { name: 'Bật video', exact: true }).click()
    await until(
      () =>
        page.evaluate(
          () => document.querySelector('.remote-video').videoWidth > 0,
        ),
      30000,
    )
    await until(
      () =>
        peer.evaluate(
          () => document.querySelector('.remote-video').videoWidth > 0,
        ),
      30000,
    )
    await page.getByRole('button', { name: 'Tắt camera', exact: true }).click()
    await page
      .getByRole('button', { name: 'Bật camera', exact: true })
      .waitFor()
    await shot(page, 'video-call-1577.png')
    await page
      .getByRole('button', { name: 'Kết thúc cuộc gọi', exact: true })
      .click()
    await until(() => peer.locator('.call-panel').isHidden())
  })
  await ctx2.close()
  await check(
    'connection loss uses a toast reconnect action without a technical screen',
    async () => {
      proxy.disconnectAll()
      await page
        .locator('.toast')
        .filter({ hasText: 'Kết nối liên lạc bị gián đoạn' })
        .getByRole('button', { name: 'Kết nối lại', exact: true })
        .click()
      await until(() => proxy.accounts.has('1001@pbx.test'))
      assert.match(page.url(), /messages/)
    },
  )
  await check(
    '401 during an active call tears down identity, media and in-session data',
    async () => {
      const incomingCtx = await inlineContext()
      const incoming = await incomingCtx.newPage()
      await login(incoming, 'member01')
      await page
        .getByRole('button', { name: 'Gọi thoại từ hội thoại', exact: true })
        .click()
      await incoming
        .getByRole('button', { name: 'Trả lời', exact: true })
        .click()
      await connected(page)
      await control({ unauthorized: true })
      await page
        .getByRole('button', { name: 'Hội thoại mới', exact: true })
        .click()
      await page.waitForURL('**/login')
      await until(() => incoming.locator('.call-panel').isHidden())
      await incomingCtx.close()
      await until(() => proxy.accounts.size === 0)
      assert.equal(await page.locator('audio, video').count(), 0)
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      )
      await page.locator('.toast').filter({ hasText: 'hết hạn' }).waitFor()
      await control({ unauthorized: false })
    },
  )
  await check(
    'communication setup failures are toasts with retry while people search remains usable',
    async () => {
      await control({ sipError: true })
      await login(page, 'alice', false)
      const toast = page
        .locator('.toast-error')
        .filter({ hasText: 'tạm thời không khả dụng' })
      await toast.waitFor()
      await page
        .getByRole('button', { name: 'Hội thoại mới', exact: true })
        .first()
        .click()
      await page.locator('.person-option').first().waitFor()
      await page.keyboard.press('Escape')
      await control({ sipError: false })
      await toast.getByRole('button', { name: 'Thử lại', exact: true }).click()
      await until(() => proxy.accounts.has('1001@pbx.test'))
      await logout(page)
    },
  )
  await check(
    'token expiry uses a toast and closes communication without another API request',
    async () => {
      await control({ ttlMs: 2500 })
      await login(page)
      await page.waitForURL('**/login', { timeout: 10000 })
      await until(() => proxy.accounts.size === 0)
      await page.locator('.toast').filter({ hasText: 'hết hạn' }).waitFor()
      await control({ ttlMs: 3600000 })
    },
  )
  await check(
    'account-menu logout during a call revokes token, clears drafts and restores saved history on login',
    async () => {
      const token = await login(page)
      await selectPerson(page)
      const incomingCtx = await inlineContext()
      const incoming = await incomingCtx.newPage()
      await login(incoming, 'member01')
      await page
        .getByRole('button', { name: 'Gọi thoại từ hội thoại', exact: true })
        .click()
      await incoming
        .getByRole('button', { name: 'Trả lời', exact: true })
        .click()
      await connected(page)
      await logout(page)
      await until(() => incoming.locator('.call-panel').isHidden())
      await incomingCtx.close()
      await until(() => proxy.accounts.size === 0)
      await until(
        async () =>
          (
            await fetch(controlUrl.replace('/__control', '/api/v1/users'), {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).status === 401,
      )
      await login(page)
      await until(async () => (await page.locator('.conversation-item').count()) > 0)
      assert.equal(await page.getByLabel('Nội dung tin nhắn', { exact: true }).inputValue(), '')
      await logout(page)
    },
  )
  assert.deepEqual(errors, [])
  const stats = await (await fetch(controlUrl)).json()
  const report = {
    results,
    sip: proxy.stats,
    api: stats.calls,
    browserErrors: errors,
    apiRunner: process.env.TEST_API_RUNNER || 'portable local handler',
    livePbxVerified: false,
  }
  await writeFile(
    new URL('verification.json', output),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await shot(page, 'failure.png').catch(() => {})
  console.error('BROWSER ERRORS', errors)
  console.error('SIP STATS', proxy.stats)
  if (peer && !peer.isClosed())
    await shot(peer, 'failure-peer.png').catch(() => {})
  throw error
} finally {
  await browser.close()
  await proxy.close()
}
