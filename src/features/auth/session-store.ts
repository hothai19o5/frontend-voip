import type { AppSession, UserProfile } from '../../lib/contracts'

export type SessionCredentials = Pick<AppSession, 'accessToken' | 'expiresAt'>

type Snapshot = {
  session: AppSession | null
  pendingSession: SessionCredentials | null
  notice: string
}

const storageKey = 'voip:session:v1'
const expiredNotice =
  'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.'

function isUnexpired(
  session: Partial<SessionCredentials> | null,
): session is SessionCredentials {
  return (
    typeof session?.accessToken === 'string' &&
    Boolean(session.accessToken.trim()) &&
    typeof session.expiresAt === 'string' &&
    Date.parse(session.expiresAt) > Date.now()
  )
}

function clearStoredSession() {
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch {
    // Storage can be disabled. The session can still be cleared in memory.
  }
}

function readStoredSession(): SessionCredentials | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (raw === null) return null
    const stored: Partial<SessionCredentials> | null = JSON.parse(raw)
    if (isUnexpired(stored)) {
      return { accessToken: stored.accessToken, expiresAt: stored.expiresAt }
    }
  } catch {
    // Invalid or inaccessible storage can be ignored during startup.
  }
  clearStoredSession()
  return null
}

function saveSession({ accessToken, expiresAt, user }: AppSession) {
  const { id, username, displayName, email, role, status, createdAt } = user
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        accessToken,
        expiresAt,
        user: { id, username, displayName, email, role, status, createdAt },
      }),
    )
  } catch {
    clearStoredSession()
  }
}

let snapshot: Snapshot = {
  session: null,
  pendingSession: readStoredSession(),
  notice: '',
}
const listeners = new Set<() => void>()

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function currentSession() {
  return snapshot.session ?? snapshot.pendingSession
}

export const sessionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: () => snapshot,
  clearNotice(expectedNotice: string) {
    if (snapshot.notice === expectedNotice) publish({ ...snapshot, notice: '' })
  },
  start(session: AppSession) {
    if (!isUnexpired(session)) {
      throw new Error(
        'Máy chủ trả về phiên đăng nhập không hợp lệ. Vui lòng thử lại.',
      )
    }
    saveSession(session)
    publish({ session, pendingSession: null, notice: '' })
  },
  confirmRestore(pending: SessionCredentials, user: UserProfile) {
    if (snapshot.pendingSession !== pending) return
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      this.expire(pending.accessToken)
      return
    }
    this.start({ ...pending, tokenType: 'Bearer', user })
  },
  end(notice = '', expectedToken = currentSession()?.accessToken) {
    if (expectedToken !== currentSession()?.accessToken) return
    clearStoredSession()
    publish({ session: null, pendingSession: null, notice })
  },
  expire(token: string) {
    this.end(expiredNotice, token)
  },
  checkExpiry() {
    const session = currentSession()
    if (session && Date.parse(session.expiresAt) <= Date.now())
      this.expire(session.accessToken)
  },
}
