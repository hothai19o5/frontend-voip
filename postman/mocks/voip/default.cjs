// Local stand-in for ../backend-voip/docs/openapi.yaml. Never deployed.
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const KEY = 'voip.state'
const summary = (extension) => ({
  extension: String(extension),
  domain: 'pbx.test',
  provisioningStatus: 'READY',
  extensionPresent: true,
})
const seed = () => ({
  users: [
    {
      id: randomUUID(),
      username: 'alice',
      displayName: 'Nguyễn Minh Anh',
      email: 'alice@example.test',
      password: 'test-password',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      sip: summary(1001),
    },
    ...[
      'Trần Hoàng Nam',
      'Lê Phương Linh',
      'Phạm Ngọc Mai',
      'Đỗ Tuấn Anh',
      'Vũ Minh Khang',
      'Nguyễn Thu Hà',
      'Bùi Hải Yến',
      'Hoàng Gia Bảo',
      'Trịnh Đức Huy',
      'Lý Thảo Nguyên',
      'Dương Thanh Tùng',
      'Võ Khánh An',
    ].map((name, i) => ({
      id: randomUUID(),
      username: `member${String(i + 1).padStart(2, '0')}`,
      displayName: name,
      email: `member${i}@example.test`,
      password: 'test-password',
      role: 'USER',
      status: i === 4 ? 'BLOCKED' : 'ACTIVE',
      createdAt: new Date().toISOString(),
      sip: summary(1002 + i),
    })),
  ],
  sessions: {},
  control: {},
  calls: {},
  history: [],
  historySequence: 0,
})
const profile = ({ password: _password, ...user }) => user
const directory = ({ id, username, displayName, status, sip }, online) => ({
  id,
  username,
  displayName,
  status,
  sip,
  online,
})
const address = (user) => `sip:${user.sip.extension}@${user.sip.domain}`
function onlineUsers(state, now = Date.now()) {
  return new Set(Object.values(state.sessions)
    .filter((session) =>
      session.presenceUntil > now &&
      Date.parse(session.expiresAt) > now &&
      state.users.some((user) => user.id === session.userId && user.status === 'ACTIVE'),
    )
    .map((session) => session.userId))
}
function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type':
      status >= 400 ? 'application/problem+json' : 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(status === 204 ? undefined : JSON.stringify(body))
}
function problem(res, status, code, errors) {
  send(res, status, {
    type: 'about:blank',
    title: code,
    status,
    code,
    detail: code,
    instance: '/api/v1',
    ...(errors ? { errors } : {}),
  })
}
async function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    return JSON.parse(body || '{}')
  } catch {
    return {}
  }
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    url.pathname = url.pathname.replace(/^\/voip(?=\/)/, '')
    const body = await bodyOf(req)
    let state = (await pm.state.get(KEY)) || seed()
    const save = () => pm.state.set(KEY, state)
    if (url.pathname === '/__control') {
      if (req.method === 'POST') {
        if (body.reset) state = seed()
        state.control = { ...state.control, ...body }
        await save()
      }
      return send(res, 200, {
        users: state.users.length,
        calls: state.calls,
        sessions: Object.keys(state.sessions).length,
      })
    }
    const path = url.pathname.replace(/^\/api\/v1/, '')
    state.calls[`${req.method} ${path}`] =
      (state.calls[`${req.method} ${path}`] || 0) + 1
    if (path === '/auth/register' && req.method === 'POST') {
      if (
        !/^[A-Za-z0-9_.-]{3,32}$/.test(body.username ?? '') ||
        !body.email?.includes('@') ||
        !body.displayName?.trim() ||
        body.password?.length < 8
      ) {
        await save()
        return problem(res, 400, 'VALIDATION_ERROR')
      }
      if (state.users.some((u) => u.username === body.username.toLowerCase())) {
        await save()
        return problem(res, 409, 'USERNAME_TAKEN')
      }
      if (state.users.some((u) => u.email === body.email.toLowerCase())) {
        await save()
        return problem(res, 409, 'EMAIL_TAKEN')
      }
      const user = {
        ...body,
        id: randomUUID(),
        username: body.username.toLowerCase(),
        email: body.email.toLowerCase(),
        role: 'USER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        sip: summary(1000 + state.users.length + 1),
      }
      state.users.push(user)
      await save()
      return send(res, 201, profile(user))
    }
    if (path === '/auth/login' && req.method === 'POST') {
      const user = state.users.find(
        (u) =>
          u.username === body.username.toLowerCase() &&
          u.password === body.password &&
          u.status === 'ACTIVE',
      )
      if (!user) {
        await save()
        return problem(res, 401, 'INVALID_CREDENTIALS')
      }
      const accessToken = randomUUID()
      const expiresAt = new Date(
        Date.now() + (state.control.ttlMs || 3600000),
      ).toISOString()
      state.sessions[accessToken] = { userId: user.id, expiresAt }
      await save()
      return send(res, 200, {
        accessToken,
        tokenType: 'Bearer',
        expiresAt,
        user: profile(user),
      })
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const session = state.sessions[token]
    if (
      !session ||
      Date.parse(session.expiresAt) <= Date.now() ||
      state.control.unauthorized
    ) {
      await save()
      return problem(res, 401, 'UNAUTHORIZED')
    }
    const caller = state.users.find((u) => u.id === session.userId)
    if (path === '/presence/heartbeat' && req.method === 'POST') {
      if (state.control.presenceError) return problem(res, 503, 'PRESENCE_UNAVAILABLE')
      const now = Date.now()
      session.presenceUntil = now + (state.control.presenceTtlMs ?? 75000)
      await save()
      return send(res, 200, { onlineUserIds: [...onlineUsers(state, now)] })
    }
    if (path.startsWith('/message-history/')) {
      state.history ||= []
      if (req.method === 'PUT' && path.startsWith('/message-history/send/')) {
        const { peer, body: content } = body
        const id = `chat:${caller.id}:${decodeURIComponent(path.split('/').at(-1))}`
        const existing = state.history.find(
          (item) => item.owner === caller.id && item.id === id,
        )
        if (existing && (existing.peer !== peer || existing.body !== content)) {
          await save()
          return problem(res, 409, 'MESSAGE_CONFLICT')
        }
        // The existing SIP scenarios exercise the fallback explicitly.
        const recipient = state.control.webChat && state.users.find(
          (user) => user.sip && address(user) === peer,
        )
        if (!recipient) {
          await save()
          return problem(res, 404, 'SIP_ONLY')
        }
        if (recipient.status !== 'ACTIVE') {
          await save()
          return problem(res, 403, 'CHAT_UNAVAILABLE')
        }
        const time = Date.now()
        const message = existing || {
          id, sequence: String(++state.historySequence), owner: caller.id,
          account: address(caller), peer, name: recipient.displayName,
          direction: 'outgoing', body: content, status: 'accepted', time,
        }
        if (!existing) {
          state.history.push(message, {
            id, sequence: String(++state.historySequence), owner: recipient.id,
            account: peer, peer: address(caller), name: caller.displayName,
            direction: 'incoming', body: content, status: 'received', time, senderName: caller.displayName,
          })
        }
        await save()
        const { owner: _owner, ...result } = message
        return send(res, 200, result)
      }
      if (req.method === 'PUT' && path.startsWith('/message-history/messages/')) {
        if (state.control.historyWriteError) { await save(); return problem(res, 503, 'HISTORY_UNAVAILABLE') }
        const id = decodeURIComponent(path.split('/').at(-1))
        let entry = state.history.find((item) => item.owner === caller.id && item.id === id)
        if (!entry) {
          entry = { ...body, id, sequence: String(++state.historySequence), owner: caller.id }
          state.history.push(entry)
        } else if (entry.status === 'pending') entry.status = body.status
        await save()
        const { owner: _owner, ...result } = entry
        return send(res, 200, result)
      }
      if (state.control.historyReadError) { await save(); return problem(res, 503, 'HISTORY_UNAVAILABLE') }
      const updating = path.endsWith('/updates')
      const size = Number(url.searchParams.get('size') || (updating ? 100 : 50))
      const before = Number(url.searchParams.get('before') || Number.MAX_SAFE_INTEGER)
      let entries = state.history.filter((item) => item.owner === caller.id).sort((a, b) => Number(b.sequence) - Number(a.sequence))
      if (updating) {
        const after = Number(url.searchParams.get('after'))
        entries = entries.filter((item) => Number(item.sequence) > after).reverse()
      } else {
        if (path.endsWith('/conversations')) entries = [...new Map(entries.toReversed().map((item) => [item.peer, item])).values()].sort((a, b) => Number(b.sequence) - Number(a.sequence))
        else entries = entries.filter((item) => item.peer === url.searchParams.get('peer'))
        entries = entries.filter((item) => Number(item.sequence) < before)
      }
      const content = entries.slice(0, size).map(({ owner: _owner, ...item }) => {
        const user = state.users.find((candidate) => candidate.sip && address(candidate) === item.peer)
        const entry = { ...item, peerUserId: user?.id ?? null }
        return path.endsWith('/conversations')
          ? { peer: item.peer, name: item.name, lastMessage: entry }
          : entry
      })
      const nextCursor = entries.length > size ? entries[size - 1].sequence : null
      await save()
      if (state.control.historyReadDelay) await new Promise((resolve) => setTimeout(resolve, state.control.historyReadDelay))
      return send(res, 200, { content, nextCursor })
    }
    if (path === '/auth/logout' && req.method === 'POST') {
      delete state.sessions[token]
      await save()
      return send(res, 204)
    }
    if (path === '/users/me' && req.method === 'GET') {
      await save()
      return send(res, 200, profile(caller))
    }
    if (path === '/sip/account' && req.method === 'GET') {
      await save()
      if (state.control.sipError)
        return problem(res, 503, 'TELEPHONY_UNAVAILABLE')
      return send(res, 200, {
        extension: caller.sip.extension,
        domain: caller.sip.domain,
        serverIp: '127.0.0.1',
        wssUrl: 'ws://127.0.0.1:15061',
        password: 'simulation-only',
      })
    }
    if (path === '/users' && req.method === 'GET') {
      await save()
      if (state.control.directoryError)
        return problem(res, 503, 'TELEPHONY_UNAVAILABLE')
      const q = (url.searchParams.get('q') || '').toLowerCase(),
        page = Number(url.searchParams.get('page') || 0),
        size = Number(url.searchParams.get('size') || 20)
      const users = state.users
        .filter(
          (u) =>
            u.id !== caller.id &&
            (!q ||
              u.username.includes(q) ||
              u.displayName.toLowerCase().includes(q)),
        )
        .sort((a, b) => a.username.localeCompare(b.username))
      const online = onlineUsers(state)
      return send(res, 200, {
        content: users.slice(page * size, (page + 1) * size).map((user) => directory(user, online.has(user.id))),
        page,
        size,
        totalElements: users.length,
        totalPages: Math.ceil(users.length / size),
        hasNext: (page + 1) * size < users.length,
      })
    }
    await save()
    return problem(res, 501, 'NOT_MODELED')
  })
  .listen(process.env.PORT || 14020, '127.0.0.1')
