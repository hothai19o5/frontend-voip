import { useEffect, useState } from 'react'
import { Delete, History, Phone } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { Field, Loading, Notice } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { useSession } from '../auth/use-session'
import { useSip } from '../sip/sip-context'
import { PeopleList } from '../users/people-picker'
import { callOutcome } from './call-format'
import type { DialedCall } from './call-history-context'
import { useCallHistory } from './call-history-context'
import { dialableNumber } from './phone-number'
import './calls-page.css'

const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0']
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function CallsPage() {
  const { session } = useSession()
  const sip = useSip()
  const [number, setNumber] = useState('')
  const [invalid, setInvalid] = useState(false)
  const ready = sip.state.connection === 'registered' && !!sip.account
  const canCall = ready && sip.state.call === 'idle' && !sip.pendingPhone

  function changeNumber(value: string) {
    setNumber(value.slice(0, 40))
    setInvalid(false)
  }

  return (
    <main className="calls-page">
      <section className="island calls-compose" aria-labelledby="calls-heading">
        <header className="calls-heading">
          <h1 id="calls-heading">Cuộc gọi</h1>
        </header>
        <Tabs.Root defaultValue="dial" className="calls-tabs">
          <Tabs.List aria-label="Chọn cách gọi">
            <Tabs.Trigger value="dial">Bàn phím</Tabs.Trigger>
            <Tabs.Trigger value="people">Người dùng</Tabs.Trigger>
          </Tabs.List>
          {!ready ? (
            <div className="calls-notice">
              <Notice tone="info">
                {sip.loading
                  ? 'Đang kết nối gọi điện…'
                  : 'Chưa kết nối gọi điện.'}
              </Notice>
            </div>
          ) : null}
          <Tabs.Content value="dial" className="dial-tab">
            <form
              className="dial-pad"
              onSubmit={(event) => {
                event.preventDefault()
                if (!dialableNumber(number)) {
                  setInvalid(true)
                  return
                }
                if (canCall) void sip.callPhone(number)
              }}
            >
              <Field
                id="dial-number"
                label="Số điện thoại"
                type="tel"
                placeholder="Nhập hoặc dán số"
                autoComplete="off"
                maxLength={40}
                value={number}
                onChange={(event) => changeNumber(event.target.value)}
                error={
                  invalid ? 'Vui lòng nhập số điện thoại hợp lệ.' : undefined
                }
              />
              <div className="dial-keys" role="group" aria-label="Bàn phím số">
                {digits.map((digit) => (
                  <Button
                    key={digit}
                    type="button"
                    variant="outline"
                    disabled={digit === '+' && !!number}
                    onClick={() => changeNumber(number + digit)}
                  >
                    {digit}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Xóa ký tự cuối"
                  disabled={!number}
                  onClick={() => changeNumber(number.slice(0, -1))}
                >
                  <Delete />
                </Button>
              </div>
              <Button
                className="primary-action dial-submit"
                type="submit"
                disabled={!canCall || !number.trim()}
              >
                <Phone /> Gọi
              </Button>
            </form>
          </Tabs.Content>
          <Tabs.Content value="people" className="calls-people">
            <PeopleList
              action="call"
              disabled={!canCall}
              select={(user) => {
                void sip.call(user)
              }}
            />
          </Tabs.Content>
        </Tabs.Root>
      </section>
      <RecentCalls
        token={session!.accessToken}
        canCall={canCall}
        callPhone={sip.callPhone}
      />
    </main>
  )
}

function RecentCalls({
  token,
  canCall,
  callPhone,
}: {
  token: string
  canCall: boolean
  callPhone: ReturnType<typeof useSip>['callPhone']
}) {
  const [items, setItems] = useState<DialedCall[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const { revision: historyRevision } = useCallHistory()
  useEffect(() => {
    const abort = new AbortController()
    let loading = false
    async function load() {
      if (loading || document.visibilityState === 'hidden') return
      loading = true
      try {
        const data = await api.dialedCalls(token, abort.signal)
        if (!abort.signal.aborted) {
          setItems(data)
          setFailed(false)
        }
      } catch {
        if (!abort.signal.aborted) setFailed(true)
      } finally {
        loading = false
      }
    }
    void load()
    const poll = window.setInterval(load, 5000)
    document.addEventListener('visibilitychange', load)
    return () => {
      abort.abort()
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', load)
    }
  }, [token, revision, historyRevision])

  return (
    <section className="island calls-recent" aria-labelledby="recent-heading">
      <header className="calls-heading">
        <h2 id="recent-heading">Gần đây</h2>
      </header>
      {failed ? (
        <div className="calls-recent-error">
          <Notice>Chưa tải được lịch sử cuộc gọi.</Notice>
          <Button
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Thử lại
          </Button>
        </div>
      ) : null}
      {items === null && !failed ? <Loading label="Đang tải lịch sử…" /> : null}
      {items?.length === 0 && !failed ? (
        <div className="empty-state">
          <History />
          <h3>Chưa có cuộc gọi đã quay số</h3>
        </div>
      ) : null}
      <ul className="dialed-list">
        {items?.map((item) => (
          <li key={item.id}>
            <div className="dialed-details">
              <strong>{item.name || item.phoneNumber}</strong>
              {item.name ? <span>{item.phoneNumber}</span> : null}
              <small>
                {callOutcome[item.status]} · {dateFormat.format(item.endedAt)}
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={!canCall}
              title="Gọi lại"
              aria-label={`Gọi lại ${item.phoneNumber}`}
              onClick={() => {
                void callPhone(item.phoneNumber, item.route === 'APP_TO_PHONE')
              }}
            >
              <Phone />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
