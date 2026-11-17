import test from 'node:test'
import assert from 'node:assert/strict'
import {
  observeRemoteVideo,
  videoDiagnosis,
  videoSnapshot,
} from '../src/features/sip/remote-video.js'

class Track extends EventTarget {
  constructor(kind, id) {
    super()
    this.kind = kind
    this.id = id
    this.readyState = 'live'
    this.muted = true
  }
  stop() {
    this.stopped = true
  }
}
class Stream {
  constructor(tracks) {
    this.tracks = [...tracks]
  }
  getTracks() {
    return [...this.tracks]
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video')
  }
  addTrack(track) {
    this.tracks.push(track)
  }
  removeTrack(track) {
    this.tracks = this.tracks.filter((existing) => existing !== track)
  }
}
class Video extends EventTarget {
  srcObject = null
  playCalls = 0
  videoWidth = 0
  videoHeight = 0
  paused = true
  async play() {
    this.playCalls++
    if (this.rejectPlayback) throw new Error('Autoplay denied')
    this.paused = false
  }
}
class Peer extends EventTarget {
  tracks = []
  connectionState = 'connected'
  iceConnectionState = 'connected'
  direction = 'sendrecv'
  report = new Map()
  getReceivers() {
    return this.tracks.map((track) => ({ track }))
  }
  getTransceivers() {
    return this.getReceivers().map((receiver) => ({
      receiver,
      currentDirection: this.direction,
    }))
  }
  async getStats() {
    return this.report
  }
}
const flush = async () => {
  for (let index = 0; index < 5; index++) await Promise.resolve()
}

function fixture(t) {
  const peer = new Peer()
  const video = new Video()
  const snapshots = []
  const observer = observeRemoteVideo({
    peer,
    video,
    onDiagnostics: (info) => snapshots.push(info),
    createStream: (tracks) => new Stream(tracks),
  })
  t.after(() => observer.stop())
  return { peer, video, snapshots, observer }
}

test('video diagnostics exclude audio and distinguish missing frame statistics from zero', () => {
  const peer = new Peer()
  peer.tracks = [new Track('video', 'v1')]
  const report = new Map([
    [
      'audio',
      {
        type: 'inbound-rtp',
        kind: 'audio',
        bytesReceived: 99999,
        packetsReceived: 900,
      },
    ],
    [
      'video',
      {
        type: 'inbound-rtp',
        kind: 'video',
        bytesReceived: 1200,
        packetsReceived: 12,
        framesDecoded: 0,
        codecId: 'h264',
      },
    ],
    ['send', { type: 'outbound-rtp', kind: 'video', bytesSent: 3000 }],
    ['h264', { type: 'codec', mimeType: 'video/H264' }],
  ])
  const info = videoSnapshot(peer, report, new Video())
  assert.equal(info.bytesReceived, 1200)
  assert.equal(info.packetsReceived, 12)
  assert.equal(info.framesDecoded, 0)
  assert.equal(info.framesReceived, null)
  assert.equal(info.bytesSent, 3000)
  assert.equal(info.codec, 'video/H264')
  assert.equal(info.directions, 'sendrecv')
})

test('late receiver video is attached and replayed without replacing SIP.js ontrack', async (t) => {
  const f = fixture(t)
  const sipHandler = () => {}
  f.peer.ontrack = sipHandler
  f.peer.tracks.push(new Track('audio', 'a1'))
  await flush()
  assert.equal(f.video.srcObject, null)
  const track = new Track('video', 'v1')
  f.peer.tracks.push(track)
  f.peer.dispatchEvent(new Event('track'))
  await flush()
  assert.deepEqual(f.video.srcObject.getTracks(), [track])
  assert.equal(f.peer.ontrack, sipHandler)
  const calls = f.video.playCalls
  track.muted = false
  track.dispatchEvent(new Event('unmute'))
  await flush()
  assert.ok(f.video.playCalls > calls)
  assert.equal(f.video.muted, true)
})

test('renegotiation removes ended receiver tracks and attaches their replacement', async (t) => {
  const f = fixture(t)
  const oldTrack = new Track('video', 'old')
  f.peer.tracks = [oldTrack]
  f.peer.dispatchEvent(new Event('track'))
  const stream = f.video.srcObject
  oldTrack.readyState = 'ended'
  const nextTrack = new Track('video', 'new')
  f.peer.tracks = [nextTrack]
  f.peer.dispatchEvent(new Event('signalingstatechange'))
  await flush()
  assert.equal(f.video.srcObject, stream)
  assert.deepEqual(stream.getTracks(), [nextTrack])
})

test('autoplay rejection is visible and a manual retry clears it', async (t) => {
  const f = fixture(t)
  f.video.rejectPlayback = true
  f.peer.tracks = [new Track('video', 'v1')]
  f.peer.dispatchEvent(new Event('track'))
  await flush()
  assert.equal(f.snapshots.at(-1).playbackError, 'Autoplay denied')
  f.video.rejectPlayback = false
  await f.observer.play()
  await flush()
  assert.equal(f.snapshots.at(-1).playbackError, '')
})

test('video counters refresh and calculate byte growth without counting audio', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] })
  const f = fixture(t)
  f.peer.report = new Map([
    [
      'v1',
      {
        type: 'inbound-rtp',
        kind: 'video',
        bytesReceived: 100,
        framesDecoded: 1,
      },
    ],
  ])
  await flush()
  t.mock.timers.tick(1000)
  await flush()
  f.peer.report.set('v1', {
    type: 'inbound-rtp',
    kind: 'video',
    bytesReceived: 2100,
    framesDecoded: 31,
  })
  t.mock.timers.tick(1000)
  await flush()
  assert.equal(f.snapshots.at(-1).bytesReceived, 2100)
  assert.equal(f.snapshots.at(-1).bytesPerSecond, 2000)
  assert.equal(f.snapshots.at(-1).framesDecoded, 31)
})

test('stop removes listeners and ignores a late stats result without stopping receiver tracks', async (t) => {
  const f = fixture(t)
  const track = new Track('video', 'v1')
  f.peer.tracks = [track]
  f.peer.dispatchEvent(new Event('track'))
  await flush()
  const playCalls = f.video.playCalls
  const count = f.snapshots.length
  f.observer.stop()
  f.peer.dispatchEvent(new Event('track'))
  track.dispatchEvent(new Event('unmute'))
  await flush()
  assert.equal(f.video.playCalls, playCalls)
  assert.equal(f.snapshots.length, count)
  assert.equal(f.video.srcObject, null)
  assert.equal(track.stopped, undefined)
})

test('stats resolving after stop cannot publish state for an ended call', async (t) => {
  const f = fixture(t)
  await flush()
  let resolveStats
  f.peer.getStats = () =>
    new Promise((resolve) => {
      resolveStats = resolve
    })
  f.peer.dispatchEvent(new Event('connectionstatechange'))
  const count = f.snapshots.length
  f.observer.stop()
  resolveStats(new Map())
  await flush()
  assert.equal(f.snapshots.length, count)
})

test('diagnoses separate negotiation, transport, decode and display symptoms', () => {
  const base = {
    directions: 'sendrecv',
    bytesReceived: 100,
    framesDecoded: 30,
    width: 640,
    height: 480,
    paused: false,
  }
  assert.match(
    videoDiagnosis({ ...base, directions: 'sendonly' }),
    /chưa có chiều nhận/,
  )
  assert.match(videoDiagnosis({ ...base, bytesReceived: 0 }), /chờ dữ liệu/)
  assert.match(videoDiagnosis({ ...base, framesDecoded: 0 }), /chưa giải mã/)
  assert.match(videoDiagnosis({ ...base, width: 0 }), /chưa hiển thị/)
  assert.match(videoDiagnosis({ ...base, playbackError: 'denied' }), /Phát lại/)
  assert.match(
    videoDiagnosis({ ...base, statsError: 'closed' }),
    /Không đọc được/,
  )
  assert.match(videoDiagnosis(base), /đã nhận dữ liệu/)
})
