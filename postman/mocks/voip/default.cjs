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
})
const profile = ({ password: _password, ...user }) => user
const directory = ({ id, username, displayName, status, sip }) => ({
  id,
  username,
  displayName,
  status,
  sip,
})
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
      return send(res, 200, {
        content: users.slice(page * size, (page + 1) * size).map(directory),
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
