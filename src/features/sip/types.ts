import type { VideoDiagnostics } from './remote-video'

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'registering' | 'registered'
export type CallState =
  'idle' | 'outgoing' | 'incoming' | 'answering' | 'active' | 'ending'
export interface SipState {
  connection: ConnectionState
  call: CallState
  peer: string
  offeredVideo: boolean
  hasVideo: boolean
  muted: boolean
  cameraOff: boolean
  videoDiagnostics: VideoDiagnostics | null
}

export const connectionLabels: Record<ConnectionState, string> = {
  disconnected: 'Chưa kết nối SIP',
  connecting: 'Đang kết nối SIP',
  connected: 'SIP chưa đăng ký',
  registering: 'Đang đăng ký SIP',
  registered: 'SIP đã đăng ký',
}

export const callLabels: Record<CallState, string> = {
  idle: 'Sẵn sàng',
  outgoing: 'Đang gọi…',
  incoming: 'Cuộc gọi đến',
  answering: 'Đang trả lời…',
  active: 'Đang trong cuộc gọi',
  ending: 'Đang kết thúc…',
}
