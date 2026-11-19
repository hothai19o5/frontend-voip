import type {
  AppSession,
  PresenceSnapshot,
  RegisterInput,
  SipAccount,
  UserPage,
  UserProfile,
} from './contracts'
import { sessionStore } from '../features/auth/session-store'
import type {
  HistoryConversation,
  HistoryEntry,
  HistoryPage,
} from '../features/messages/message-store'
import type { HistoryWrite } from '../features/messages/history-writer'
import type {
  CallEntry,
  CallPage,
  CallResult,
  DialedCall,
  ResolvedPhoneCall,
  CallThread,
  MissedCalls,
} from '../features/calls/call-history-context'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  USERNAME_TAKEN: 'Tên đăng nhập đã được sử dụng.',
  EMAIL_TAKEN: 'Địa chỉ email đã được sử dụng.',
  INVALID_PHONE_NUMBER: 'Vui lòng nhập số điện thoại hợp lệ.',
  PHONE_ALREADY_IN_USE: 'Số điện thoại đã được sử dụng.',
  SELF_CALL: 'Bạn đang quay số điện thoại của chính mình.',
  APP_DESTINATION_UNAVAILABLE: 'Người nhận hiện không thể liên lạc.',
  CALLER_SIP_UNAVAILABLE: 'Máy nhánh của bạn chưa sẵn sàng để gọi.',
  PSTN_DESTINATION_DENIED:
    'Chỉ hỗ trợ gọi tới số di động và cố định tại Việt Nam.',
  PHONE_CALLING_DISABLED: 'Tính năng quay số chưa được bật.',
  ACCOUNT_CONFLICT: 'Tài khoản đã tồn tại. Vui lòng kiểm tra lại thông tin.',
  PROVISIONING_PENDING:
    'Tài khoản đang chờ hoàn tất cấu hình gọi điện. Vui lòng liên hệ quản trị viên.',
  EXTENSION_CONFLICT:
    'Số máy nhánh đang được sử dụng. Vui lòng liên hệ quản trị viên.',
  TELEPHONY_NOT_CONFIGURED: 'Dịch vụ gọi điện chưa được cấu hình.',
  TELEPHONY_AUTH_FAILED:
    'Máy chủ chưa kết nối được dịch vụ gọi điện. Vui lòng liên hệ quản trị viên.',
  TELEPHONY_UNAVAILABLE:
    'Dịch vụ gọi điện tạm thời không khả dụng. Vui lòng thử lại sau.',
  TELEPHONY_TIMEOUT: 'Dịch vụ gọi điện phản hồi quá lâu. Vui lòng thử lại sau.',
  TELEPHONY_INVALID_RESPONSE: 'Dịch vụ gọi điện trả về dữ liệu không hợp lệ.',
  TELEPHONY_REJECTED:
    'Dịch vụ gọi điện từ chối yêu cầu. Vui lòng liên hệ quản trị viên.',
  CHAT_UNAVAILABLE: 'Tài khoản này hiện không thể nhận tin nhắn.',
  ATTACHMENT_TOO_LARGE: 'Tệp có thể nặng tối đa 10 MiB.',
  EMPTY_ATTACHMENT: 'Tệp đã chọn không có nội dung.',
  INVALID_ATTACHMENT: 'Không đọc được tệp đã chọn.',
  ATTACHMENT_UNAVAILABLE:
    'Kho lưu trữ tệp tạm thời không khả dụng. Vui lòng thử lại.',
  ATTACHMENT_NOT_FOUND: 'Không tìm thấy tệp đính kèm.',
}

export class ApiError extends Error {
  status: number
  code: string
  fields: Record<string, string>
  constructor(
    status: number,
    code: string,
    fields: Record<string, string> = {},
  ) {
    super(
      messages[code] ??
        (status === 400
          ? 'Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường bên dưới.'
          : 'Không thực hiện được yêu cầu. Vui lòng thử lại.'),
    )
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export async function request<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    token?: string
    signal?: AbortSignal
    keepalive?: boolean
    timeoutMs?: number
    responseType?: 'blob'
  } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20000)
  const multipart = options.body instanceof FormData
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: options.responseType === 'blob' ? '*/*' : 'application/json',
        ...(options.body && !multipart
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: multipart
        ? (options.body as FormData)
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
      cache: 'no-store',
      credentials: 'omit',
      signal,
      keepalive: options.keepalive,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(
      timeout.aborted
        ? 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'
        : 'Không kết nối được máy chủ. Vui lòng kiểm tra kết nối mạng.',
    )
  }
  if (!response.ok) {
    if (response.status === 401 && options.token)
      sessionStore.expire(options.token)
    const problem = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      problem.code ?? 'REQUEST_FAILED',
      problem.errors ?? {},
    )
  }
  if (response.status === 204) return undefined as T
  if (options.responseType === 'blob') return response.blob() as Promise<T>
  return response.json()
}

export const api = {
  contactPhone: (token: string, peer: string, signal: AbortSignal) =>
    request<{ phoneNumber: string | null }>(
      `/users/contact-phone?${new URLSearchParams({ peer })}`,
      { token, signal },
    ),
  resolvePhoneCall: (token: string, phoneNumber: string, signal: AbortSignal) =>
    request<ResolvedPhoneCall>('/calls/resolve', {
      token,
      method: 'POST',
      body: { phoneNumber },
      signal,
    }),
  dialedCalls: (token: string, signal?: AbortSignal) =>
    request<DialedCall[]>('/calls/dialed', { token, signal }),
  login: (username: string, password: string, signal?: AbortSignal) =>
    request<AppSession>('/auth/login', {
      method: 'POST',
      body: { username, password },
      signal,
    }),
  register: (body: RegisterInput, signal?: AbortSignal) =>
    request<UserProfile>('/auth/register', { method: 'POST', body, signal }),
  logout: (token: string) =>
    request<void>('/auth/logout', { method: 'POST', token }),
  me: (token: string, signal?: AbortSignal) =>
    request<UserProfile>('/users/me', { token, signal }),
  users: (token: string, q: string, page: number, signal?: AbortSignal) =>
    request<UserPage>(
      `/users?${new URLSearchParams({ q, page: String(page), size: '10' })}`,
      { token, signal },
    ),
  presenceHeartbeat: (token: string, signal: AbortSignal) =>
    request<PresenceSnapshot>('/presence/heartbeat', {
      method: 'POST',
      token,
      signal,
    }),
  sipAccount: (token: string, signal?: AbortSignal) =>
    request<SipAccount>('/sip/account', { token, signal }),
  saveCall: (token: string, body: CallResult) =>
    request<void>('/calls', { token, body, method: 'POST', keepalive: true }),
  callHistory: (
    token: string,
    peer: string,
    before: string | null,
    signal: AbortSignal,
  ) =>
    request<CallPage<CallEntry>>(
      `/calls?${new URLSearchParams({ peer, ...(before ? { before } : {}) })}`,
      { token, signal },
    ),
  callThreads: (token: string, before: string | null, signal: AbortSignal) =>
    request<CallPage<CallThread>>(
      `/calls/threads${before ? `?${new URLSearchParams({ before })}` : ''}`,
      { token, signal },
    ),
  markMissedCallsSeen: (token: string, peer: string, through: string) =>
    request<MissedCalls>('/calls/missed', {
      token,
      method: 'PUT',
      body: { peer, through },
    }),
  historyConversations: (
    token: string,
    before?: string,
    signal?: AbortSignal,
  ) =>
    request<HistoryPage<HistoryConversation>>(
      `/message-history/conversations?${new URLSearchParams({ size: '30', ...(before ? { before } : {}) })}`,
      { token, signal },
    ),
  historyMessages: (
    token: string,
    peer: string,
    before?: string,
    signal?: AbortSignal,
  ) =>
    request<HistoryPage<HistoryEntry>>(
      `/message-history/messages?${new URLSearchParams({ peer, size: '50', ...(before ? { before } : {}) })}`,
      { token, signal },
    ),
  historyUpdates: (token: string, after: string, signal: AbortSignal) =>
    request<HistoryPage<HistoryEntry>>(
      `/message-history/updates?${new URLSearchParams({ after })}`,
      { token, signal },
    ),
  sendDirectMessage: (
    token: string,
    id: string,
    peer: string,
    body: string,
    signal: AbortSignal,
  ) =>
    request<HistoryEntry>(`/message-history/send/${encodeURIComponent(id)}`, {
      token,
      method: 'PUT',
      body: { peer, body },
      signal,
    }),
  sendAttachment: (
    token: string,
    id: string,
    peer: string,
    file: File,
    signal: AbortSignal,
  ) => {
    const body = new FormData()
    body.set('peer', peer)
    body.set('file', file)
    return request<HistoryEntry>(
      `/message-history/attachments/${encodeURIComponent(id)}`,
      {
        token,
        method: 'PUT',
        body,
        signal,
        timeoutMs: 120000,
      },
    )
  },
  downloadAttachment: (token: string, id: string, signal?: AbortSignal) =>
    request<Blob>(`/message-history/attachments/${encodeURIComponent(id)}`, {
      token,
      signal,
      responseType: 'blob',
      timeoutMs: 120000,
    }),
  saveHistory: (token: string, id: string, body: HistoryWrite) =>
    request<HistoryEntry>(
      `/message-history/messages/${encodeURIComponent(id)}`,
      {
        token,
        method: 'PUT',
        body,
        keepalive:
          new TextEncoder().encode(JSON.stringify(body)).length < 16000,
      },
    ),
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Đã xảy ra lỗi. Vui lòng thử lại.'
}
