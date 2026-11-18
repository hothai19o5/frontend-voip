import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Info,
  MessageCircle,
  Phone,
  Search,
  SquarePen,
  Video,
} from 'lucide-react'
import { Field, PersonAvatar } from '../../components/app-ui'
import { Button } from '../../components/ui/button'
import { useToast } from '../../components/toast-context'
import { useMediaQuery } from '../../hooks/use-media-query'
import type { DirectoryUser } from '../../lib/contracts'
import { PresenceStatus } from '../presence/presence-status'
import { useSip } from '../sip/sip-context'
import { PeoplePicker } from '../users/people-picker'
import { useMessages } from './message-context'
import { normalizePeer } from './message-store'
import { MessageBubble } from './message-bubble'
import { timeLabel } from './message-format'
import { ConversationProfile } from './conversation-profile'
import { MessageComposer } from './message-composer'
import { messagePreview } from './message-content'

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

export function MessagesPage() {
  const {
    conversations,
    dispatch,
    historyLoading,
    historyError,
    moreConversations,
    loadConversations,
    loadingPeers,
    peerErrors,
    loadHistory,
    retrySave,
  } = useMessages()
  const sip = useSip()
  const notify = useToast()
  const [params, setParams] = useSearchParams()
  const explicitPeer = params.get('peer')
  const [search, setSearch] = useState('')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [profilePreference, setProfilePreference] = useState<boolean | null>(
    null,
  )
  const wide = useMediaQuery('(min-width: 1280px)')
  const profileOpen = profilePreference ?? wide
  const bottom = useRef<HTMLDivElement>(null)
  const historyElement = useRef<HTMLDivElement>(null)
  const sorted = Object.values(conversations).sort(
    (a, b) => (b.messages.at(-1)?.time ?? 0) - (a.messages.at(-1)?.time ?? 0),
  )
  const selected = explicitPeer
    ? conversations[normalizePeer(explicitPeer)]
    : sorted[0]
  const messages = selected?.messages ?? []
  const lastId = messages.at(-1)?.id
  const selectedPeer = selected?.peer
  const historyLoaded = selected?.historyLoaded
  const unsaved = Object.values(conversations).some((conversation) =>
    conversation.messages.some((message) => message.historyState === 'failed'),
  )
  const filtered = sorted.filter((item) =>
    `${item.name} ${item.peer} ${item.user?.username ?? ''}`
      .toLocaleLowerCase('vi')
      .includes(search.toLocaleLowerCase('vi')),
  )
  const blocked = selected?.user?.status === 'BLOCKED'

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedPeer, lastId, historyLoaded])
  useEffect(() => {
    if (selectedPeer && !historyLoaded) void loadHistory(selectedPeer)
  }, [selectedPeer, historyLoaded, loadHistory])

  async function loadOlder() {
    if (!selectedPeer) return
    const element = historyElement.current
    const height = element?.scrollHeight ?? 0
    const top = element?.scrollTop ?? 0
    await loadHistory(selectedPeer)
    requestAnimationFrame(() => {
      if (element?.dataset.peer === selectedPeer)
        element.scrollTop = top + element.scrollHeight - height
    })
  }
  useEffect(() => {
    if (!selectedPeer) return
    const markRead = () => {
      if (
        !peopleOpen &&
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        (explicitPeer || innerWidth > 640)
      )
        dispatch({ type: 'read', peer: selectedPeer })
    }
    markRead()
    window.addEventListener('focus', markRead)
    document.addEventListener('visibilitychange', markRead)
    return () => {
      window.removeEventListener('focus', markRead)
      document.removeEventListener('visibilitychange', markRead)
    }
  }, [selectedPeer, lastId, explicitPeer, peopleOpen, dispatch])

  function connectionReady() {
    if (sip.state.connection === 'registered') return true
    notify({
      id: 'communication-not-ready',
      message: 'Chưa thể liên lạc lúc này. Vui lòng thử lại.',
      tone: 'info',
      action: { label: 'Thử lại', onClick: sip.retry },
    })
    return false
  }
  function openConversation(user: DirectoryUser) {
    if (!user.sip || user.status !== 'ACTIVE') return
    const peer = normalizePeer(`${user.sip.extension}@${user.sip.domain}`)
    dispatch({ type: 'open', user })
    setParams({ peer })
    setPeopleOpen(false)
    setSearch('')
  }
  function call(video = false) {
    if (!selected || !connectionReady()) return
    if (selected.user) void sip.call(selected.user, video)
    else void sip.callAddress(selected.peer, selected.name, video)
  }
  const canCall =
    Boolean(selected) &&
    sip.state.call === 'idle' &&
    !blocked &&
    (!selected?.user ||
      (selected.user.sip?.provisioningStatus === 'READY' &&
        selected.user.sip.extensionPresent === true))

  return (
    <>
      <main
        className={`messages-page ${profileOpen ? 'profile-is-open' : ''}`}
        data-selected={Boolean(explicitPeer)}
      >
        <section
          className="conversation-list-panel island"
          aria-label="Danh sách hội thoại"
        >
          <div className="conversation-list-heading">
            <h1>Đoạn chat</h1>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Hội thoại mới"
              title="Hội thoại mới"
              onClick={() => setPeopleOpen(true)}
            >
              <SquarePen />
            </Button>
          </div>
          <div className="conversation-search">
            <Field
              id="search-conversations"
              label="Tìm hội thoại"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm đoạn chat"
              icon={<Search />}
            />
          </div>
          <div className="conversation-items">
            {historyLoading ? (
              <p className="history-controls" role="status">
                Đang tải hội thoại…
              </p>
            ) : null}
            {historyError ? (
              <div className="history-controls" role="status">
                <span>Chưa tải được lịch sử. {historyError}</span>
                <Button
                  variant="ghost"
                  onClick={() => void loadConversations()}
                >
                  Thử lại tải hội thoại
                </Button>
              </div>
            ) : null}
            {unsaved ? (
              <div className="history-controls" role="status">
                <span>Một số tin nhắn chưa được lưu lịch sử.</span>
                <Button variant="ghost" onClick={retrySave}>
                  Thử lại lưu lịch sử
                </Button>
              </div>
            ) : null}
            {filtered.length ? (
              filtered.map((conversation) => {
                const last = conversation.messages.at(-1)
                return (
                  <button
                    key={conversation.peer}
                    className={`conversation-item ${selected?.peer === conversation.peer ? 'is-selected' : ''}`}
                    onClick={() => setParams({ peer: conversation.peer })}
                    aria-pressed={selected?.peer === conversation.peer}
                  >
                    <span className="presence-avatar">
                      <PersonAvatar name={conversation.name} />
                      <PresenceStatus
                        userId={conversation.user?.id ?? conversation.peerUserId}
                        dot
                      />
                    </span>
                    <span className="conversation-preview">
                      <strong>{conversation.name}</strong>
                      <span>
                        {conversation.draft ? (
                          <>
                            <em>Bản nháp: </em>
                            {conversation.draft}
                          </>
                        ) : last ? (
                          `${last.direction === 'outgoing' ? 'Bạn: ' : ''}${messagePreview(last.body)}`
                        ) : (
                          'Bắt đầu cuộc trò chuyện'
                        )}
                      </span>
                    </span>
                    <span className="conversation-preview-meta">
                      {last ? <time>{timeLabel(last.time)}</time> : null}
                      {conversation.unread ? (
                        <span className="unread-count">
                          {conversation.unread > 99
                            ? '99+'
                            : conversation.unread}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })
            ) : !historyLoading && !historyError ? (
              <div className="conversation-list-empty">
                <MessageCircle />
                <strong>
                  {search ? 'Không tìm thấy đoạn chat' : 'Chưa có đoạn chat'}
                </strong>
                <p>
                  {search
                    ? 'Thử tìm bằng tên khác.'
                    : 'Bắt đầu một cuộc trò chuyện mới.'}
                </p>
                {!search ? (
                  <Button variant="ghost" onClick={() => setPeopleOpen(true)}>
                    Tìm người dùng
                  </Button>
                ) : null}
              </div>
            ) : null}
            {moreConversations ? (
              <div className="history-controls">
                <Button
                  variant="ghost"
                  disabled={historyLoading}
                  onClick={() => void loadConversations()}
                >
                  Tải hội thoại cũ hơn
                </Button>
              </div>
            ) : null}
          </div>
        </section>
        <section
          className="message-thread island"
          aria-label="Nội dung hội thoại"
        >
          {selected ? (
            <>
              <header className="thread-header">
                <Button
                  variant="ghost"
                  size="icon"
                  className="thread-back"
                  aria-label="Trở về danh sách hội thoại"
                  onClick={() => setParams({})}
                >
                  <ArrowLeft />
                </Button>
                <PersonAvatar name={selected.name} />
                <div className="thread-identity">
                  <h2>{selected.name}</h2>
                  {selected.user || selected.peerUserId ? (
                    <span className="presence-details">
                      {selected.user ? (
                        <span>@{selected.user.username}</span>
                      ) : null}
                      <PresenceStatus
                        userId={selected.user?.id ?? selected.peerUserId}
                      />
                    </span>
                  ) : null}
                </div>
                <div className="thread-header-actions">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Gọi thoại từ hội thoại"
                    disabled={!canCall}
                    onClick={() => call()}
                  >
                    <Phone />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Gọi video từ hội thoại"
                    disabled={!canCall}
                    onClick={() => call(true)}
                  >
                    <Video />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Thông tin hội thoại"
                    aria-pressed={profileOpen}
                    onClick={() => setProfilePreference(!profileOpen)}
                  >
                    <Info />
                  </Button>
                </div>
              </header>
              <div
                className="message-history"
                ref={historyElement}
                data-peer={selectedPeer}
                role="log"
                aria-label="Tin nhắn"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {loadingPeers.has(selected.peer) ? (
                  <p className="history-controls" role="status">
                    Đang tải tin nhắn…
                  </p>
                ) : null}
                {peerErrors[selected.peer] ? (
                  <div className="history-controls" role="status">
                    <span>Chưa tải được tin nhắn cũ.</span>
                    <Button
                      variant="ghost"
                      onClick={() => void loadHistory(selected.peer)}
                    >
                      Thử lại tải tin nhắn
                    </Button>
                  </div>
                ) : null}
                {selected.historyCursor ? (
                  <div className="history-controls">
                    <Button
                      variant="ghost"
                      disabled={loadingPeers.has(selected.peer)}
                      onClick={() => void loadOlder()}
                    >
                      Tải tin nhắn cũ hơn
                    </Button>
                  </div>
                ) : null}
                {messages.length ? (
                  messages.map((message, index) => (
                    <div key={message.id}>
                      {index === 0 ||
                      new Date(message.time).toDateString() !==
                        new Date(messages[index - 1].time).toDateString() ? (
                        <div className="message-date">
                          <span>{dateLabel(message.time)}</span>
                        </div>
                      ) : null}
                      <MessageBubble message={message} />
                    </div>
                  ))
                ) : !loadingPeers.has(selected.peer) &&
                  !peerErrors[selected.peer] ? (
                  <div className="thread-intro">
                    <PersonAvatar name={selected.name} large />
                    <h2>{selected.name}</h2>
                    <p>Gửi lời chào để bắt đầu cuộc trò chuyện.</p>
                  </div>
                ) : null}
                <div ref={bottom} />
              </div>
              <MessageComposer key={selected.peer} conversation={selected} />
            </>
          ) : (
            <div className="messages-welcome">
              <div className="welcome-message-icon">
                <MessageCircle />
              </div>
              <h2>Bắt đầu cuộc trò chuyện</h2>
              <p>Chọn một đoạn chat hoặc tìm người để nhắn tin và gọi điện.</p>
              <Button
                className="primary-action"
                onClick={() => setPeopleOpen(true)}
              >
                <SquarePen />
                Hội thoại mới
              </Button>
            </div>
          )}
        </section>
        {profileOpen ? (
          <ConversationProfile
            conversation={selected}
            close={() => setProfilePreference(false)}
            call={call}
            canCall={canCall}
          />
        ) : null}
      </main>
      <PeoplePicker
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        select={openConversation}
      />
    </>
  )
}
