import { WebSocketServer } from 'ws'

// Test-only SIP signaling proxy. No registrar authentication, NAT or PBX media
// behavior is claimed; real SIP.js and browser WebRTC still run at both ends.
export function createSipProxy(port = 15061) {
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port,
    handleProtocols: () => 'sip',
  })
  const accounts = new Map(),
    aliases = new Map(),
    transactions = new Map()
  const stats = {
    connections: 0,
    registrations: 0,
    invites: 0,
    byes: 0,
    rejects: 0,
    messages: 0,
  }
  const normalize = (value) =>
    (value.match(/sips?:([^>;\s]+)/)?.[1] ?? '').split(';')[0]
  function parse(raw) {
    const [head, ...body] = raw.split('\r\n\r\n')
    const lines = head.split('\r\n'),
      first = lines.shift()
    const headers = new Map()
    for (const line of lines) {
      const i = line.indexOf(':')
      const key = line.slice(0, i).toLowerCase()
      if (!headers.has(key)) headers.set(key, line.slice(i + 1).trim())
    }
    return { first, headers, body: body.join('\r\n\r\n'), raw }
  }
  function response(socket, message, status, reason) {
    const h = message.headers
    const to =
      h.get('to') + (h.get('to').includes(';tag=') ? '' : ';tag=mock-pbx')
    socket.send(
      `SIP/2.0 ${status} ${reason}\r\nVia: ${h.get('via')}\r\nFrom: ${h.get('from')}\r\nTo: ${to}\r\nCall-ID: ${h.get('call-id')}\r\nCSeq: ${h.get('cseq')}\r\n${h.get('contact') ? `Contact: ${h.get('contact')}\r\nExpires: 600\r\n` : ''}Content-Length: 0\r\n\r\n`,
    )
  }
  server.on('connection', (socket) => {
    stats.connections++
    socket.on('message', (buffer) => {
      const raw = buffer.toString()
      if (!raw.trim()) {
        socket.send('\r\n')
        return
      }
      const message = parse(raw),
        h = message.headers
      const method = message.first.split(' ')[0]
      if (method === 'SIP/2.0') {
        const origin = transactions.get(`${h.get('via')}|${h.get('cseq')}`)
        if (origin?.readyState === 1) origin.send(raw)
        return
      }
      if (h.get('contact')) aliases.set(normalize(h.get('contact')), socket)
      if (method === 'REGISTER') {
        stats.registrations++
        const key = normalize(h.get('to'))
        if (
          h.get('expires') === '0' ||
          /expires=0(?:;|$|\s|,)/.test(h.get('contact') ?? '')
        )
          accounts.delete(key)
        else accounts.set(key, socket)
        response(socket, message, 200, 'OK')
        return
      }
      if (method === 'INVITE') {
        stats.invites++
        stats.lastInviteTarget = normalize(message.first.split(' ')[1])
      }
      if (method === 'MESSAGE') stats.messages++
      if (method === 'BYE') stats.byes++
      if (method === 'OPTIONS') {
        response(socket, message, 200, 'OK')
        return
      }
      const target = normalize(message.first.split(' ')[1])
      const destination = accounts.get(target) ?? aliases.get(target)
      if (destination?.readyState === 1) {
        transactions.set(`${h.get('via')}|${h.get('cseq')}`, socket)
        destination.send(raw)
      } else if (method !== 'ACK') {
        stats.rejects++
        response(socket, message, 480, 'Temporarily Unavailable')
      }
    })
    socket.on('close', () => {
      for (const [key, value] of accounts)
        if (value === socket) accounts.delete(key)
      for (const [key, value] of aliases)
        if (value === socket) aliases.delete(key)
    })
  })
  return {
    stats,
    accounts,
    disconnectAll: () => {
      for (const socket of server.clients) socket.close()
    },
    close: async () => {
      for (const socket of server.clients) socket.terminate()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
