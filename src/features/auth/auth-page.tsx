import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  UserRound,
  Video,
} from 'lucide-react'
import { Brand, Field } from '../../components/app-ui'
import { useToast } from '../../components/toast-context'
import { Button } from '../../components/ui/button'
import { api, ApiError, errorMessage } from '../../lib/api'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { sessionStore } from './session-store'
import { useSession } from './use-session'

export function AuthPage({ register = false }: { register?: boolean }) {
  const { session } = useSession()
  const notify = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  if (session) return <Navigate to="/messages" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username')).trim()
    const password = String(form.get('password'))
    setFields({})
    setBusy(true)
    const abort = new AbortController()
    controller.current = abort
    try {
      if (register) {
        const displayName = String(form.get('displayName')).trim()
        if (!displayName) {
          setFields({ displayName: 'Vui lòng nhập tên hiển thị.' })
          return
        }
        await api.register(
          {
            username,
            password,
            displayName,
            email: String(form.get('email')).trim(),
          },
          abort.signal,
        )
        if (!abort.signal.aborted) {
          notify({
            message: 'Tài khoản đã được tạo. Đăng nhập để bắt đầu.',
            tone: 'success',
          })
          navigate('/login', { replace: true, state: { registered: username } })
        }
      } else {
        const next = await api.login(username, password, abort.signal)
        if (abort.signal.aborted) return
        sessionStore.start(next)
        const from = location.state?.from
        navigate(
          typeof from === 'string' && /^\/messages(\?|$)/.test(from)
            ? from
            : '/messages',
          { replace: true },
        )
      }
    } catch (cause) {
      if (!abort.signal.aborted) {
        const message = errorMessage(cause)
        notify({
          message:
            message +
            (register && message.includes('phản hồi quá lâu')
              ? ' Kiểm tra đăng nhập trước khi đăng ký lại.'
              : ''),
          tone: 'error',
        })
        if (cause instanceof ApiError) setFields(cause.fields)
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <section className="auth-story" aria-label={`Giới thiệu ${APP_NAME}`}>
          <Brand />
          <div className="story-copy">
            <span className="eyebrow">Ứng dụng {APP_NAME}</span>
            <h1>
              Nhắn tin. <br />
              Gọi thoại. <br />
              <span>Gọi video.</span>
            </h1>
            <p>
              Nhắn tin và gọi điện trực tiếp với người dùng trong hệ thống qua
              trình duyệt.
            </p>
          </div>
          <div className="connection-art" aria-hidden="true">
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-inner" />
            <span className="art-avatar art-avatar-one">AN</span>
            <span className="art-avatar art-avatar-two">ML</span>
            <span className="art-avatar art-avatar-three">TH</span>
            <div className="art-call">
              <span className="art-phone">
                <Phone size={27} fill="currentColor" />
              </span>
              <div>
                <strong>Sẵn sàng kết nối</strong>
                <span>
                  <i /> Gọi trực tiếp với {APP_NAME}
                </span>
              </div>
              <AudioWave />
            </div>
            <span className="art-float">
              <Video size={22} />
            </span>
          </div>
          <div className="story-features">
            <span>
              <MessageCircle />
              Nhắn tin
            </span>
            <span>
              <Headphones />
              Gọi thoại
            </span>
            <span>
              <Video />
              Gọi video
            </span>
          </div>
        </section>
        <section className="auth-form-panel">
          <nav className="auth-tabs" aria-label="Tài khoản">
            <Link
              to="/login"
              className={!register ? 'active' : ''}
              aria-current={!register ? 'page' : undefined}
            >
              Đăng nhập
            </Link>
            <Link
              to="/register"
              className={register ? 'active' : ''}
              aria-current={register ? 'page' : undefined}
            >
              Đăng ký
            </Link>
          </nav>
          <div className="auth-heading">
            <span className="eyebrow">
              {register ? `Bắt đầu với ${APP_NAME}` : 'Chào mừng trở lại'}
            </span>
            <h2>
              {register
                ? `Tạo tài khoản ${APP_NAME}`
                : `Đăng nhập vào ${APP_NAME}`}
            </h2>
            <p>
              {register
                ? 'Tạo tài khoản để nhắn tin và gọi điện trong hệ thống.'
                : 'Đăng nhập để nhắn tin, gọi thoại và video.'}
            </p>
          </div>
          <form onSubmit={submit} className="auth-form">
            <fieldset disabled={busy}>
              {register ? (
                <Field
                  id="displayName"
                  name="displayName"
                  label="Tên hiển thị"
                  placeholder="Họ và tên của bạn"
                  icon={<UserRound />}
                  required
                  maxLength={100}
                  autoComplete="name"
                  error={fields.displayName}
                />
              ) : null}
              <Field
                id="username"
                name="username"
                label="Tên đăng nhập"
                placeholder="Nhập tên đăng nhập"
                icon={<UserRound />}
                autoComplete="username"
                defaultValue={location.state?.registered ?? ''}
                required
                minLength={register ? 3 : 1}
                maxLength={32}
                pattern={register ? '[A-Za-z0-9_.-]{3,32}' : undefined}
                title={
                  register
                    ? '3–32 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.'
                    : undefined
                }
                error={fields.username}
              />
              {register ? (
                <Field
                  id="email"
                  name="email"
                  type="email"
                  label="Địa chỉ email"
                  placeholder="ban@congty.vn"
                  icon={<Mail />}
                  required
                  maxLength={254}
                  autoComplete="email"
                  error={fields.email}
                />
              ) : null}
              <Field
                id="password"
                name="password"
                type={visible ? 'text' : 'password'}
                label="Mật khẩu"
                placeholder={
                  register ? 'Ít nhất 8 ký tự' : 'Nhập mật khẩu của bạn'
                }
                icon={<LockKeyhole />}
                required
                minLength={register ? 8 : 1}
                maxLength={128}
                autoComplete={register ? 'new-password' : 'current-password'}
                error={fields.password}
                trailing={
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setVisible(!visible)}
                    aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {visible ? <EyeOff /> : <Eye />}
                  </button>
                }
              />
              <Button
                type="submit"
                className="primary-action auth-submit"
                disabled={busy}
              >
                {busy
                  ? register
                    ? 'Đang tạo tài khoản…'
                    : 'Đang đăng nhập…'
                  : register
                    ? 'Tạo tài khoản'
                    : 'Đăng nhập'}
                {!busy ? <ArrowRight size={18} /> : null}
              </Button>
            </fieldset>
          </form>
          <p className="auth-switch">
            {register ? 'Bạn đã có tài khoản?' : 'Bạn chưa có tài khoản?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Đăng nhập' : 'Tạo tài khoản'}
            </Link>
          </p>
        </section>
      </div>
      <p className="auth-copyright">
        {APP_NAME} · {APP_TAGLINE}
      </p>
    </main>
  )
}

function AudioWave() {
  return (
    <div className="audio-wave">
      {[12, 22, 32, 18, 27, 15, 22].map((height, index) => (
        <i key={index} style={{ height }} />
      ))}
    </div>
  )
}
