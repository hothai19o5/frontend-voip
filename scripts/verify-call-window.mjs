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
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const errors = [],
  results = []
const options = {
  viewport: { width: 1440, height: 900 },
  permissions: ['microphone', 'camera'],
}
const ctx = await browser.newContext(options)
const ctx2 = await browser.newContext(options)
for (const context of [ctx, ctx2]) {
  context.on('page', (page) =>
    page.on('pageerror', (error) => errors.push(error.message)),
  )
}
const main = await ctx.newPage(),
  peer = await ctx2.newPage()
async function until(check, timeout = 25000) {
  const start = Date.now()
  while (!(await check())) {
    if (Date.now() - start > timeout)
      throw new Error('Call window condition timed out')
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
}
async function login(page, username) {
  await page.goto(`${base}/login`)
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.waitForURL('**/messages')
}
async function selectPeer() {
  await main
    .getByRole('button', { name: 'Hội thoại mới', exact: true })
    .first()
    .click()
  await main
    .locator('.person-option')
    .filter({ hasText: 'Trần Hoàng Nam' })
    .click()
  await main.getByRole('dialog').waitFor({ state: 'hidden' })
}
async function start(video = false) {
  const outgoing = main.waitForEvent('popup')
  const incoming = peer.waitForEvent('popup')
  await main
    .getByRole('button', {
      name: video ? 'Gọi video từ hội thoại' : 'Gọi thoại từ hội thoại',
      exact: true,
    })
    .click()
  const windows = await Promise.all([outgoing, incoming])
  await windows[0]
    .getByRole('button', { name: 'Hủy cuộc gọi', exact: true })
    .waitFor()
  await windows[1]
    .getByRole('button', { name: 'Trả lời', exact: true })
    .waitFor()
  return windows
}
async function answer(caller, callee, video = false) {
  await callee
    .getByRole('button', { name: video ? 'Bật video' : 'Trả lời', exact: true })
    .click()
  for (const page of [caller, callee]) {
    await until(() =>
      page.getByRole('button', { name: 'Tắt mic', exact: true }).isEnabled(),
    )
  }
}
async function check(name, action) {
  await action()
  results.push(name)
  console.log(`PASS ${name}`)
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: new URL(name, output).pathname.replace(/^\/(\w:)/, '$1'),
    fullPage: true,
  })
}
try {
  assert.equal(
    (
      await fetch(controlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
    ).status,
    200,
  )
  await login(main, 'alice')
  await login(peer, 'member01')
  await until(() => proxy.accounts.size === 2)
  await selectPeer()
  const connections = proxy.stats.connections,
    registrations = proxy.stats.registrations
  const unchanged = () => {
    assert.equal(
      proxy.stats.connections,
      connections,
      'opening/moving views must not create a SIP connection',
    )
    assert.equal(
      proxy.stats.registrations,
      registrations,
      'opening/moving views must not register SIP again',
    )
  }
  await check(
    'outgoing/incoming popups share controls, audio, duration and a single SIP registration',
    async () => {
      const [caller, callee] = await start()
      assert.equal(await caller.title(), 'VoIP · Cuộc gọi')
      assert.equal(await main.locator('.call-panel').count(), 0)
      await answer(caller, callee)
      await until(() =>
        main.evaluate(
          () =>
            document.querySelector('audio').srcObject?.getAudioTracks().length >
            0,
        ),
      )
      await caller.getByRole('button', { name: 'Tắt mic', exact: true }).click()
      await caller
        .getByRole('button', { name: 'Bật mic', exact: true })
        .waitFor()
      await until(() =>
        caller
          .locator('.call-duration')
          .textContent()
          .then((text) => text !== '00:00'),
      )
      await shot(caller, 'call-window-voice.png')
      unchanged()
      await callee
        .getByRole('button', { name: 'Kết thúc cuộc gọi', exact: true })
        .click()
      await until(() => caller.isClosed() && callee.isClosed())
      assert.equal(
        await main.evaluate(() => document.querySelector('audio').srcObject),
        null,
      )
    },
  )
  await check(
    'decline and outgoing cancellation close both windows',
    async () => {
      let [caller, callee] = await start()
      await callee.getByRole('button', { name: 'Từ chối', exact: true }).click()
      await until(() => caller.isClosed() && callee.isClosed())
      ;[caller, callee] = await start()
      await caller
        .getByRole('button', { name: 'Hủy cuộc gọi', exact: true })
        .click()
      await until(() => caller.isClosed() && callee.isClosed())
      unchanged()
    },
  )
  await check(
    'video moves between documents without replacing streams or stopping tracks',
    async () => {
      let [caller, callee] = await start(true)
      await answer(caller, callee, true)
      for (const popup of [caller, callee]) {
        await until(() =>
          popup
            .locator('.remote-video')
            .evaluate((video) => video.videoWidth > 0),
        )
      }
      await main.evaluate(() => {
        window.__callStreams = Array.from(
          document.querySelectorAll('[data-call-media-owner] video, audio'),
          (node) => node.srcObject,
        )
      })
      await caller
        .getByRole('button', { name: 'Tắt camera', exact: true })
        .click()
      await caller
        .getByRole('button', { name: 'Bật camera', exact: true })
        .waitFor()
      await shot(caller, 'call-window-video.png')
      for (const [width, height] of [
        [760, 720],
        [390, 844],
      ]) {
        await caller.setViewportSize({ width, height })
        assert.equal(
          await caller.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        await shot(caller, `call-window-${width}.png`)
      }
      await caller.close()
      await main
        .getByRole('button', { name: 'Bật camera', exact: true })
        .waitFor()
      await main
        .getByRole('button', { name: 'Bật camera', exact: true })
        .click()
      await until(() =>
        main.locator('.remote-video').evaluate((video) => video.videoWidth > 0),
      )
      assert.equal(
        await main.evaluate(() =>
          Array.from(
            document.querySelectorAll('[data-call-media-owner] video, audio'),
          ).every(
            (node, i) =>
              node.srcObject === window.__callStreams[i] &&
              node.srcObject
                .getTracks()
                .every((track) => track.readyState === 'live'),
          ),
        ),
        true,
      )
      const next = main.waitForEvent('popup')
      await main
        .getByRole('button', { name: 'Mở cửa sổ cuộc gọi', exact: true })
        .click()
      caller = await next
      await until(() =>
        caller
          .locator('.remote-video')
          .evaluate((video) => video.videoWidth > 0),
      )
      await caller
        .getByRole('button', { name: 'Đưa về cửa sổ chính', exact: true })
        .click()
      await until(() => caller.isClosed())
      await main.getByRole('button', { name: 'Tắt mic', exact: true }).click()
      await main.getByRole('button', { name: 'Bật mic', exact: true }).waitFor()
      unchanged()
      await main
        .getByRole('button', { name: 'Kết thúc cuộc gọi', exact: true })
        .click()
      await until(() => callee.isClosed())
    },
  )
  await check(
    'reloading the child returns controls to the opener without ending the call',
    async () => {
      const [caller, callee] = await start()
      await answer(caller, callee)
      await caller.reload().catch((error) => {
        if (!caller.isClosed()) throw error
      })
      await until(() => caller.isClosed())
      await main.getByRole('button', { name: 'Tắt mic', exact: true }).waitFor()
      unchanged()
      await main
        .getByRole('button', { name: 'Kết thúc cuộc gọi', exact: true })
        .click()
      await until(() => callee.isClosed())
    },
  )
  await check(
    'logout closes detached windows, stops media and ends the remote call',
    async () => {
      const [caller, callee] = await start()
      await answer(caller, callee)
      await main
        .getByRole('button', { name: 'Menu tài khoản', exact: true })
        .click()
      await main
        .getByRole('menuitem', { name: 'Đăng xuất', exact: true })
        .click()
      await main.waitForURL('**/login')
      await until(() => caller.isClosed() && callee.isClosed())
      assert.equal(await main.locator('audio, video').count(), 0)
    },
  )
  await check(
    'reloading the main app closes its child and returns to login',
    async () => {
      await login(main, 'alice')
      await until(() => proxy.accounts.size === 2)
      await selectPeer()
      const [caller, callee] = await start()
      await answer(caller, callee)
      await main.reload()
      await main.waitForURL('**/login')
      await until(() => caller.isClosed())
      assert.equal(await main.locator('audio, video').count(), 0)
      if (!callee.isClosed()) {
        await callee
          .getByRole('button', { name: 'Kết thúc cuộc gọi', exact: true })
          .click()
        await until(() => callee.isClosed())
      }
    },
  )
  assert.deepEqual(errors, [])
  await writeFile(
    new URL('call-window-results.json', output),
    JSON.stringify(
      { results, errors, sip: proxy.stats, livePbxVerified: false },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
  await proxy.close()
}
