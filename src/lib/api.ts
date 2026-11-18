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

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  USERNAME_TAKEN: 'Tên đăng nhập đã được sử dụng.',
  EMAIL_TAKEN: 'Địa chỉ email đã được sử dụng.',
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
  } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(20000)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
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
    const problem = await response.json().catch(() => ({}))
    if (response.status === 401 && options.token)
      sessionStore.expire(options.token)
    throw new ApiError(
      response.status,
      problem.code ?? 'REQUEST_FAILED',
      problem.errors ?? {},
    )
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
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
