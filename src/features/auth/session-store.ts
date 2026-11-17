import type { AppSession } from '../../lib/contracts'

type Snapshot = { session: AppSession | null; notice: string }
let snapshot: Snapshot = { session: null, notice: '' }
const listeners = new Set<() => void>()

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

// Credentials deliberately live in memory only, as required by the backend contract.
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
    if (
      !session.accessToken ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      throw new Error(
        'Máy chủ trả về phiên đăng nhập không hợp lệ. Vui lòng thử lại.',
      )
    }
    publish({ session, notice: '' })
  },
  end(notice = '', expectedToken = snapshot.session?.accessToken) {
    if (expectedToken !== snapshot.session?.accessToken) return
    publish({ session: null, notice })
  },
  expire(token: string) {
    this.end(
      'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.',
      token,
    )
  },
  checkExpiry() {
    if (
      snapshot.session &&
      Date.parse(snapshot.session.expiresAt) <= Date.now()
    ) {
      this.expire(snapshot.session.accessToken)
    }
  },
}
