import type { CallResult, CallStatus } from './call-history-context'

export const callOutcome: Record<CallStatus, string> = {
  COMPLETED: 'Đã kết thúc',
  MISSED: 'Cuộc gọi nhỡ',
  DECLINED: 'Đã từ chối',
  CANCELED: 'Đã hủy',
  BUSY: 'Máy bận',
  UNANSWERED: 'Không có người trả lời',
  FAILED: 'Không kết nối được',
  INTERRUPTED: 'Bị gián đoạn',
  ANSWERED_ELSEWHERE: 'Đã trả lời trên thiết bị khác',
}

export function callPreview(call: CallResult) {
  if (call.status === 'MISSED')
    return call.video ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi nhỡ'
  return `${call.video ? 'Cuộc gọi video' : 'Cuộc gọi thoại'} · ${callOutcome[call.status]}`
}
