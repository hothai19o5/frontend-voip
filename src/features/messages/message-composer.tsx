import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Clock3, ImagePlus, Paperclip, Send } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useToast } from '../../components/toast-context'
import { errorMessage } from '../../lib/api'
import { useSip } from '../sip/sip-context'
import { useMessages } from './message-context'
import type { Conversation } from './message-store'
import { ExpressionPicker } from './expression-picker'
import { insertExpression, stickerBody } from './message-content'
import type { Sticker } from './message-content'

export function MessageComposer({
  conversation,
}: {
  conversation: Conversation
}) {
  const { dispatch, sendDirect } = useMessages()
  const sip = useSip()
  const notify = useToast()
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const [sending, setSending] = useState(false)
  const blocked = conversation.user?.status === 'BLOCKED'
  const disabled = sending || blocked

  function insert(value: string) {
    const element = input.current
    const draft = conversation.draft
    const next = insertExpression(
      draft,
      value,
      element?.selectionStart ?? draft.length,
      element?.selectionEnd ?? draft.length,
    )
    if (!next) {
      notify({
        id: 'message-length',
        tone: 'info',
        message: 'Tin nhắn có thể chứa tối đa 5.000 ký tự.',
      })
      return false
    }
    dispatch({ type: 'draft', peer: conversation.peer, value: next.value })
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(next.caret, next.caret)
    })
    return true
  }

  async function sendContent(body: string, clearDraft: boolean) {
    if (!body.trim() || blocked || lock.current) return false
    lock.current = true
    setSending(true)
    try {
      const result = await sendDirect(conversation.peer, body)
      let sent = result === 'sent'
      if (result === 'sip-only') {
        if (sip.state.connection !== 'registered') {
          notify({
            id: 'communication-not-ready',
            tone: 'info',
            message: 'Chưa thể liên lạc lúc này. Vui lòng thử lại.',
            action: { label: 'Thử lại', onClick: sip.retry },
          })
          return false
        }
        sent = await sip.sendMessage(conversation.peer, body)
      }
      if (sent && clearDraft)
        dispatch({
          type: 'draft',
          peer: conversation.peer,
          value: '',
          expected: body,
        })
      return sent
    } catch (error) {
      notify({
        id: 'message-send-error',
        tone: 'error',
        message: errorMessage(error),
      })
      return false
    } finally {
      lock.current = false
      setSending(false)
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendContent(conversation.draft, true)
  }
  function sendSticker(sticker: Sticker) {
    return sendContent(stickerBody(sticker), false)
  }
  function mockAttachment(kind: 'ảnh' | 'file') {
    notify({
      id: `attachment-${kind}`,
      tone: 'info',
      message: `Chức năng gửi ${kind} sẽ được bổ sung sau.`,
    })
  }

  return (
    <div className="message-composer-wrap">
      <form className="message-composer" onSubmit={send}>
        <div className="composer-tools" aria-label="Thêm nội dung tin nhắn">
          <ExpressionPicker
            disabled={Boolean(disabled)}
            sending={sending}
            insert={insert}
            sendSticker={sendSticker}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="composer-tool attachment-mock"
            aria-label="Gửi ảnh (chưa hỗ trợ)"
            title="Gửi ảnh · Sắp có"
            disabled={disabled}
            onClick={() => mockAttachment('ảnh')}
          >
            <ImagePlus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="composer-tool attachment-mock"
            aria-label="Gửi file (chưa hỗ trợ)"
            title="Gửi file · Sắp có"
            disabled={disabled}
            onClick={() => mockAttachment('file')}
          >
            <Paperclip />
          </Button>
        </div>
        <div className="field">
          <label htmlFor="message-draft">Nội dung tin nhắn</label>
          <Input
            ref={input}
            id="message-draft"
            name="message"
            value={conversation.draft}
            onChange={(event) =>
              dispatch({
                type: 'draft',
                peer: conversation.peer,
                value: event.target.value,
              })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing)
                event.preventDefault()
            }}
            placeholder="Nhập tin nhắn…"
            maxLength={5000}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          className="send-button"
          aria-label="Gửi tin nhắn"
          disabled={blocked || !conversation.draft.trim() || sending}
        >
          {sending ? <Clock3 /> : <Send />}
        </Button>
      </form>
    </div>
  )
}
