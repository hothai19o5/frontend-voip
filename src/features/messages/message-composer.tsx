import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Clock3, ImagePlus, Paperclip, Send, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useToast } from '../../components/toast-context'
import { errorMessage } from '../../lib/api'
import { createLocalId } from '../../lib/local-id'
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
  const { dispatch, sendDirect, sendAttachment } = useMessages()
  const sip = useSip()
  const notify = useToast()
  const input = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const [sending, setSending] = useState(false)
  const [attachment, setAttachment] = useState<{
    file: File
    id: string
  } | null>(null)
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
    if (!attachment) {
      await sendContent(conversation.draft, true)
      return
    }
    if (blocked || lock.current) return
    lock.current = true
    setSending(true)
    try {
      await sendAttachment(conversation.peer, attachment.id, attachment.file)
      setAttachment(null)
    } catch (error) {
      notify({ tone: 'error', message: errorMessage(error) })
    } finally {
      lock.current = false
      setSending(false)
    }
  }
  function sendSticker(sticker: Sticker) {
    return sendContent(stickerBody(sticker), false)
  }
  function selectAttachment(element: HTMLInputElement) {
    const file = element.files?.item(0)
    element.value = ''
    if (!file) return
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      notify({
        tone: 'error',
        message:
          file.size === 0
            ? 'Tệp đã chọn không có nội dung.'
            : 'Tệp có thể nặng tối đa 10 MiB.',
      })
      return
    }
    setAttachment({ file, id: createLocalId() })
  }

  return (
    <div className="message-composer-wrap">
      {attachment ? (
        <div className="composer-attachment" role="status">
          <Paperclip size={16} />
          <span>{attachment.file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Bỏ tệp đính kèm"
            disabled={sending}
            onClick={() => setAttachment(null)}
          >
            <X />
          </Button>
        </div>
      ) : null}
      <form className="message-composer" onSubmit={send}>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          aria-label="Chọn ảnh"
          hidden
          onChange={(event) => selectAttachment(event.currentTarget)}
        />
        <input
          ref={fileInput}
          type="file"
          aria-label="Chọn tệp"
          hidden
          onChange={(event) => selectAttachment(event.currentTarget)}
        />
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
            className="composer-tool"
            aria-label="Đính kèm ảnh"
            title="Đính kèm ảnh"
            disabled={disabled}
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="composer-tool"
            aria-label="Đính kèm tệp"
            title="Đính kèm tệp"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
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
          aria-label={attachment ? 'Gửi tệp đính kèm' : 'Gửi tin nhắn'}
          disabled={
            blocked || (!attachment && !conversation.draft.trim()) || sending
          }
        >
          {sending ? <Clock3 /> : <Send />}
        </Button>
      </form>
    </div>
  )
}
