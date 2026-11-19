import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INITIAL_STATE,
  SipClient,
  offersVideo,
  sipAddress,
} from '../src/features/sip/sip-client.ts'

const CONFIG = {
  server: 'wss://pbx.test:7443',
  domain: 'pbx.test',
  extension: '1001',
  password: 'test-only',
}
const rejected = (statusCode) => ({
  message: { statusCode, reasonPhrase: 'Rejected' },
})

function fixture() {
  const messages = [],
    errors = [],
    states = []
  const audio = {
    kind: 'audio',
    enabled: true,
    stop() {
      this.stopped = true
    },
  }
  const video = {
    kind: 'video',
    enabled: true,
    stop() {
      this.stopped = true
    },
  }
  const stream = {
    getTracks: () => [audio, video],
    getVideoTracks: () => [video],
  }
  const media = {
    localVideo: { srcObject: null },
    remoteAudio: { srcObject: null },
    remoteVideo: { srcObject: null, play: async () => {} },
  }
  class Manager {
    constructor(server, options) {
      this.options = options
      this.userAgent = {}
    }
    async connect() {
      this.options.delegate.onServerConnect()
    }
    async register(options) {
      this.registerOptions = options
    }
    async disconnect() {
      this.disconnected = true
      this.disconnectCount = (this.disconnectCount || 0) + 1
    }
    async call(peer, options, inviteOptions) {
      this.callOptions = options
      this.inviteOptions = inviteOptions
      const session = { remoteIdentity: { uri: sipAddress(peer, 'pbx.test') } }
      this.options.delegate.onCallCreated(session)
      return session
    }
    async answer(session, options) {
      this.answerOptions = options
      this.options.delegate.onCallAnswered(session)
    }
    async hangup(session) {
      this.options.delegate.onCallHangup(session)
    }
    async decline(session) {
      this.declined = session
      this.options.delegate.onCallHangup(session)
    }
    getLocalMediaStream() {
      return stream
    }
    getRemoteMediaStream() {
      return stream
    }
  }
  const results = []
  class Messager {
    constructor(agent, uri, body, type) {
      this.body = body
      this.uri = uri
      this.type = type
      fixture.lastMessager = this
    }
    async message(options) {
      this.delegate = options.requestDelegate
    }
  }
  const client = new SipClient(
    {
      media,
      onState: (state) => states.push(state),
      onMessage: (message) => messages.push(message),
      onError: (error) => errors.push(error),
      onCallResult: (call) => results.push(call),
    },
    { SessionManager: Manager, Messager },
  )
  async function registered() {
    await client.connect(CONFIG)
    client.manager.options.delegate.onRegistered()
    return client.manager
  }
  function incoming(manager, videoOffer = true, address = '1002') {
    const session = {
      remoteIdentity: { uri: sipAddress(address, 'pbx.test') },
      request: {
        callId: 'incoming-test-id@pbx.test',
        body: videoOffer
          ? 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'
          : 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
      },
    }
    manager.options.delegate.onCallCreated(session)
    manager.options.delegate.onCallReceived(session)
    return session
  }
  return {
    client,
    registered,
    incoming,
    messages,
    errors,
    states,
    media,
    audio,
    video,
    stream,
    results,
  }
}

test('SIP addresses and SDP distinguish offered and rejected video', () => {
  assert.equal(sipAddress('1002', 'pbx.test').toString(), 'sip:1002@pbx.test')
  assert.equal(
    sipAddress('sip:1003@other.test', 'pbx.test').toString(),
    'sip:1003@other.test',
  )
  assert.throws(() => sipAddress('1002\r\nInjected: value', 'pbx.test'))
  assert.throws(() => sipAddress('', 'pbx.test'))
  assert.equal(offersVideo('m=video 9 UDP/TLS/RTP/SAVPF 96\r\n'), true)
  assert.equal(offersVideo('m=video 0 UDP/TLS/RTP/SAVPF 96\r\n'), false)
  assert.equal(offersVideo('m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'), false)
})

test('REGISTER request sent is not the same as registered; rejection is visible', async () => {
  const f = fixture()
  await f.client.connect(CONFIG)
  assert.equal(f.client.state.connection, 'registering')
  await assert.rejects(f.client.call('1002', true), /đăng ký/)
  f.client.manager.registerOptions.requestDelegate.onReject(rejected(403))
  assert.equal(f.client.state.connection, 'connected')
  assert.match(f.errors[0].message, /403/)
  await f.client.disconnect()
})

test('audio and video calls use separate media constraints and prevent second calls', async () => {
  const f = fixture()
  const manager = await f.registered()
  await f.client.call('1002', false)
  assert.deepEqual(
    manager.callOptions.sessionDescriptionHandlerOptions.constraints,
    { audio: true, video: false },
  )
  await assert.rejects(f.client.call('1003', true), /khác/)
  await f.client.hangup()
  await f.client.call('1002', true)
  assert.deepEqual(
    manager.callOptions.sessionDescriptionHandlerOptions.constraints,
    { audio: true, video: true },
  )
  await f.client.disconnect()
})

test('incoming video can be accepted with camera; microphone and camera toggle independently', async () => {
  const f = fixture()
  const manager = await f.registered()
  f.incoming(manager)
  assert.equal(f.client.state.offeredVideo, true)
  assert.equal(f.client.state.peer, 'sip:1002@pbx.test')
  await f.client.answer(true)
  assert.equal(
    manager.answerOptions.sessionDescriptionHandlerOptions.constraints.video,
    true,
  )
  assert.equal(f.media.remoteVideo.srcObject, f.stream)
  assert.deepEqual(manager.options.media.remote, { audio: f.media.remoteAudio })
  f.client.toggleTrack('audio')
  assert.equal(f.audio.enabled, false)
  assert.equal(f.video.enabled, true)
  f.client.toggleTrack('video')
  assert.equal(f.video.enabled, false)
  f.client.toggleTrack('audio')
  assert.equal(f.audio.enabled, true)
  assert.equal(f.video.enabled, false)
  await f.client.hangup()
  assert.equal(f.client.state.call, 'idle')
  assert.equal(f.video.stopped, true)
  assert.equal(f.media.remoteVideo.srcObject, null)
  await f.client.disconnect()
})

test('answer audio-only avoids requesting a camera even for a video offer', async () => {
  const f = fixture()
  const manager = await f.registered()
  f.incoming(manager)
  await f.client.answer(false)
  assert.equal(
    manager.answerOptions.sessionDescriptionHandlerOptions.constraints.video,
    false,
  )
  await f.client.disconnect()
})

test('outgoing rejection is recorded after the hangup callback with its actual SIP status', async () => {
  const f = fixture()
  const manager = await f.registered()
  await f.client.call('1002', false, 'Trần Hoàng Nam')
  const session = f.client.session
  manager.options.delegate.onCallHangup(session)
  manager.inviteOptions.requestDelegate.onReject(rejected(486))
  manager.options.delegate.onCallHangup(session)
  await f.client.disconnect()
  assert.equal(f.results.length, 1)
  assert.equal(f.results[0].status, 'BUSY')
  assert.equal(f.results[0].name, 'Trần Hoàng Nam')
  assert.equal(f.results[0].answeredAt, null)
})

test('incoming cancel, local decline and answered elsewhere have distinct outcomes', async () => {
  const f = fixture()
  const manager = await f.registered()
  for (const reason of ['', 'SIP;cause=200;text="Call completed elsewhere"']) {
    const session = f.incoming(manager)
    session.delegate.onCancel({ request: { getHeaders: () => [reason] } })
    manager.options.delegate.onCallHangup(session)
  }
  f.incoming(manager)
  await f.client.hangup()
  assert.deepEqual(f.results.map((call) => call.status), ['MISSED', 'ANSWERED_ELSEWHERE', 'DECLINED'])
  assert.ok(f.results.every((call) => call.id === 'incoming-test-id@pbx.test'))
  await f.client.disconnect()
})

test('an inbound call from the local PBX signaling port uses the same peer as chat', async () => {
  const f = fixture()
  const manager = await f.registered()
  const local = f.incoming(manager, false, 'sip:1002@pbx.test:5060')
  manager.options.delegate.onCallHangup(local)
  const external = f.incoming(manager, false, 'sip:1002@other.test:5060')
  manager.options.delegate.onCallHangup(external)
  await f.client.disconnect()
  assert.deepEqual(f.results.map((call) => call.peer), [
    'sip:1002@pbx.test',
    'sip:1002@other.test:5060',
  ])
})

test('an answered audio-only call records duration timestamps and connection loss is separate', async () => {
  const f = fixture()
  const manager = await f.registered()
  f.incoming(manager)
  manager.getLocalMediaStream = () => ({ getVideoTracks: () => [] })
  await f.client.answer(false)
  await f.client.hangup()
  f.incoming(manager)
  manager.options.delegate.onServerDisconnect()
  await f.client.disconnect()
  assert.deepEqual(f.results.map((call) => call.status), ['COMPLETED', 'INTERRUPTED'])
  assert.equal(f.results[0].video, false)
  assert.ok(f.results[0].startedAt <= f.results[0].answeredAt)
  assert.ok(f.results[0].answeredAt <= f.results[0].endedAt)
  assert.equal(f.results[1].answeredAt, null)
})

test('declining a second incoming call preserves the first session', async () => {
  const f = fixture()
  const manager = await f.registered()
  const first = f.incoming(manager)
  const second = f.incoming(manager)
  assert.equal(manager.declined, second)
  assert.equal(f.client.session, first)
  assert.equal(f.client.state.call, 'incoming')
  await f.client.hangup()
  assert.equal(f.client.state.call, 'idle')
  await f.client.disconnect()
})

test('camera permission denial clears a failed outgoing call so it can be retried', async () => {
  const f = fixture()
  const manager = await f.registered()
  manager.call = async () => {
    throw new Error('Permission denied')
  }
  await assert.rejects(f.client.call('1002', true), /Permission denied/)
  assert.equal(f.client.state.call, 'idle')
  assert.equal(f.client.callPending, false)
  await f.client.disconnect()
})

test('camera permission denial when answering terminates the incoming session', async () => {
  const f = fixture()
  const manager = await f.registered()
  f.incoming(manager)
  manager.answer = async () => {
    throw new Error('Permission denied')
  }
  await assert.rejects(f.client.answer(true), /Permission denied/)
  assert.equal(f.client.state.call, 'idle')
  assert.equal(f.client.session, null)
  await f.client.disconnect()
})

test('messages stay pending until a positive SIP response arrives', async () => {
  const f = fixture()
  await f.registered()
  const pending = f.client.sendMessage('1002', 'Xin chào 👋\nDòng hai')
  assert.equal(f.messages[0].status, 'pending')
  assert.equal(fixture.lastMessager.type, 'text/plain')
  fixture.lastMessager.delegate.onAccept()
  await pending
  assert.equal(f.messages.at(-1).status, 'accepted')
  await f.client.disconnect()
})

test('negative MESSAGE response preserves failure instead of reporting success', async () => {
  const f = fixture()
  await f.registered()
  const pending = f.client.sendMessage('1002', 'hello')
  fixture.lastMessager.delegate.onReject(rejected(404))
  await assert.rejects(pending, /404/)
  assert.equal(f.messages.at(-1).status, 'failed')
  await f.client.disconnect()
})

test('MESSAGE timeout settles as failed and clears pending state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture()
  await f.registered()
  const pending = f.client.sendMessage('1002', 'hello')
  const check = assert.rejects(pending, /35 giây/)
  t.mock.timers.tick(35000)
  await check
  assert.equal(f.messages.at(-1).status, 'failed')
  assert.equal(f.client.pendingMessages.size, 0)
  await f.client.disconnect()
})

test('incoming messages use actual sender identity instead of the current call target', async () => {
  const f = fixture()
  const manager = await f.registered()
  manager.options.delegate.onMessageReceived({
    request: {
      body: 'Chào từ 1003',
      from: { uri: sipAddress('1003', 'pbx.test') },
      getHeader: () => 'text/plain; charset=utf-8',
    },
  })
  assert.equal(f.messages[0].peer, 'sip:1003@pbx.test')
  assert.equal(f.messages[0].body, 'Chào từ 1003')
  assert.equal(f.messages[0].account, 'sip:1001@pbx.test')
  await f.client.disconnect()
})

test('disconnect fails outstanding messages, clears media, and ignores stale callbacks', async () => {
  const f = fixture()
  const oldManager = await f.registered()
  const pending = f.client.sendMessage('1002', 'hello')
  const check = assert.rejects(pending, /ngắt kết nối/)
  await f.client.disconnect()
  await check
  oldManager.options.delegate.onRegistered()
  assert.deepEqual(f.client.state, INITIAL_STATE)
  assert.equal(f.client.pendingMessages.size, 0)
  assert.equal(oldManager.disconnected, true)
})

test('logout during initial async connect cannot create a late SIP client', async () => {
  const f = fixture()
  const connecting = f.client.connect(CONFIG)
  await f.client.disconnect()
  await connecting
  assert.equal(f.client.manager, null)
  assert.equal(f.client.state.connection, 'disconnected')
})

test('rapid reconnect discards the earlier connect attempt', async () => {
  const f = fixture()
  await Promise.all([f.client.connect(CONFIG), f.client.connect(CONFIG)])
  assert.equal(f.client.state.connection, 'registering')
  const manager = f.client.manager
  manager.options.delegate.onRegistered()
  assert.equal(f.client.state.connection, 'registered')
  await f.client.disconnect()
})

test('a late unregistered callback after WSS loss cannot report connected', async () => {
  const f = fixture()
  const manager = await f.registered()
  manager.options.delegate.onServerDisconnect()
  manager.options.delegate.onUnregistered()
  assert.equal(f.client.state.connection, 'disconnected')
  await f.client.disconnect()
})

test('logout and beforeunload share one cleanup and remove the retired unload listener', async () => {
  const original = globalThis.window
  const listeners = new Set()
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (type === 'beforeunload') listeners.add(handler)
    },
    removeEventListener: (type, handler) => {
      if (type === 'beforeunload') listeners.delete(handler)
    },
  }
  const f = fixture()
  try {
    const manager = await f.registered()
    assert.equal(manager.options.autoStop, false)
    assert.equal(listeners.size, 1)
    const staleUnload = [...listeners][0]
    const stopping = f.client.disconnect()
    assert.equal(listeners.size, 0)
    staleUnload()
    await stopping
    await f.client.stopping
    assert.equal(manager.disconnectCount, 1)
    await f.registered()
    assert.equal(listeners.size, 1)
  } finally {
    await f.client.disconnect()
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
  assert.equal(listeners.size, 0)
})

test('a delayed media failure after logout cannot clear a newer call', async () => {
  const f = fixture()
  const old = await f.registered()
  let reject
  old.call = () =>
    new Promise((resolve, fail) => {
      reject = fail
    })
  const pending = f.client.call('1002', false)
  const rejected = assert.rejects(pending, /permission/)
  await f.client.disconnect()
  await f.registered()
  await f.client.call('1003', false)
  reject(new Error('permission denied'))
  await rejected
  assert.equal(f.client.state.call, 'outgoing')
  assert.equal(f.client.state.peer, 'sip:1003@pbx.test')
  await f.client.disconnect()
})
