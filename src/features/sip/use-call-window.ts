import { useCallback, useEffect, useRef, useState } from 'react'
import { createLocalId } from '../../lib/local-id'
import { APP_NAME } from '../../lib/brand'
import type { CallState } from './types'

// The child document has no app entry point, credentials or SIP client.
// React renders a portal into it while the opener owns the entire call.
export function useCallWindow() {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [name] = useState(() => `voip-call-${createLocalId()}`)
  const child = useRef<Window | null>(null)
  const release = useRef<(() => void) | null>(null)
  const previousCall = useRef<CallState>('idle')

  const close = useCallback(() => {
    release.current?.()
    setContainer(null)
  }, [])

  const open = useCallback(() => {
    if (child.current && !child.current.closed) {
      child.current.focus()
      return
    }
    // Dispose a closed window before opening another, even if its polling
    // callback has not run yet.
    release.current?.()
    let popup: Window | null = null
    try {
      popup = window.open(
        '',
        name,
        'popup=yes,width=760,height=720,resizable=yes,scrollbars=yes',
      )
      if (!popup || popup.closed) return
      const view = popup
      const doc = popup.document
      doc.title = `${APP_NAME} · Cuộc gọi`
      doc.documentElement.lang = document.documentElement.lang || 'vi'
      const base = doc.createElement('base')
      base.href = document.baseURI
      doc.head.appendChild(base)
      const viewport = doc.createElement('meta')
      viewport.name = 'viewport'
      viewport.content = 'width=device-width, initial-scale=1'
      doc.head.appendChild(viewport)
      const styles = doc.createElement('div')
      doc.head.appendChild(styles)
      const copyStyles = () =>
        styles.replaceChildren(
          ...Array.from(
            document.querySelectorAll('style, link[rel="stylesheet"]'),
            (node) => node.cloneNode(true),
          ),
        )
      copyStyles()
      const observer = new MutationObserver(copyStyles)
      observer.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true,
      })
      doc.body.className = 'call-window-body'
      const root = doc.createElement('main')
      root.className = 'call-window-root'
      doc.body.appendChild(root)
      child.current = popup
      const onClosed = () => {
        if (child.current !== view) return
        release.current?.()
        setContainer(null)
      }
      // Some browsers do not dispatch pagehide when the window is closed.
      const timer = window.setInterval(() => {
        if (view.closed) onClosed()
      }, 500)
      const onOwnerClosed = () => close()
      popup.addEventListener('pagehide', onClosed)
      window.addEventListener('pagehide', onOwnerClosed)
      release.current = () => {
        release.current = null
        child.current = null
        observer.disconnect()
        window.clearInterval(timer)
        view.removeEventListener('pagehide', onClosed)
        window.removeEventListener('pagehide', onOwnerClosed)
        view.close()
      }
      setContainer(root)
      popup.focus()
    } catch {
      // Popup blockers or browser restrictions leave the inline panel usable.
      popup?.close()
    }
  }, [close, name])

  const syncCall = useCallback(
    (call: CallState) => {
      if (call === 'incoming' && previousCall.current !== 'incoming') open()
      if (call === 'idle') close()
      previousCall.current = call
    },
    [open, close],
  )

  useEffect(() => () => release.current?.(), [])

  return { container, open, close, syncCall }
}
