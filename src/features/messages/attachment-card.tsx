import { useEffect, useRef, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useToast } from '../../components/toast-context'
import { api, errorMessage } from '../../lib/api'
import { useSession } from '../auth/use-session'
import { isImageAttachment } from './message-store'
import type { Attachment } from './message-store'

function ImagePreview({
  token,
  id,
  filename,
}: {
  token: string
  id: string
  filename: string
}) {
  const target = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = target.current
    if (!element) return
    const abort = new AbortController()
    let source = ''
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void api.downloadAttachment(token, id, abort.signal).then(
        (blob) => {
          if (abort.signal.aborted) return
          source = URL.createObjectURL(blob)
          setUrl(source)
        },
        () => {
          if (!abort.signal.aborted) setFailed(true)
        },
      )
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      abort.abort()
      if (source) URL.revokeObjectURL(source)
    }
  }, [id, token])

  return (
    <div ref={target} className="attachment-image">
      {failed ? (
        <span>Không xem trước được ảnh</span>
      ) : url ? (
        <img src={url} alt={filename} onError={() => setFailed(true)} />
      ) : (
        <span>Đang tải ảnh…</span>
      )}
    </div>
  )
}

const sizeLabel = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${Math.round(size / 1024)} KiB`
      : `${(size / (1024 * 1024)).toFixed(1)} MiB`

export function AttachmentCard({
  id,
  attachment,
  preview = true,
}: {
  id: string
  attachment: Attachment
  preview?: boolean
}) {
  const token = useSession().session?.accessToken
  const notify = useToast()
  const [downloading, setDownloading] = useState(false)
  const activeDownload = useRef<AbortController | null>(null)
  useEffect(() => () => activeDownload.current?.abort(), [token, id])

  async function download() {
    if (!token || activeDownload.current) return
    const abort = new AbortController()
    activeDownload.current = abort
    setDownloading(true)
    try {
      const blob = await api.downloadAttachment(token, id, abort.signal)
      if (abort.signal.aborted) return
      const source = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = source
      anchor.download = attachment.filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(source), 1000)
    } catch (error) {
      if (!abort.signal.aborted)
        notify({ tone: 'error', message: errorMessage(error) })
    } finally {
      activeDownload.current = null
      if (!abort.signal.aborted) setDownloading(false)
    }
  }

  return (
    <div className="attachment-card">
      {preview && token && isImageAttachment(attachment) ? (
        <ImagePreview token={token} id={id} filename={attachment.filename} />
      ) : null}
      <div className="attachment-details">
        <FileText size={18} aria-hidden="true" />
        <div>
          <strong>{attachment.filename}</strong>
          <small>{sizeLabel(attachment.size)}</small>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={!token || downloading}
          onClick={() => void download()}
          aria-label={`Tải xuống ${attachment.filename}`}
        >
          <Download />
        </Button>
      </div>
    </div>
  )
}
