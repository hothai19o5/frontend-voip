import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Toast } from 'radix-ui'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext } from './toast-context'
import type { ToastMessage } from './toast-context'
import { createLocalId } from '../lib/local-id.js'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<(ToastMessage & { id: string })[]>([])
  const notify = useCallback((item: ToastMessage) => {
    const id = item.id ?? createLocalId()
    setItems((previous) =>
      previous.some((entry) => entry.id === id)
        ? previous
        : [...previous.slice(-2), { ...item, id }],
    )
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      <Toast.Provider label="Thông báo" duration={7000} swipeDirection="right">
        {children}
        {items.map((item) => (
          <Toast.Root
            key={item.id}
            className={`toast toast-${item.tone ?? 'info'}`}
            type={item.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open)
                setItems((previous) =>
                  previous.filter((entry) => entry.id !== item.id),
                )
            }}
          >
            {item.tone === 'error' ? (
              <AlertCircle />
            ) : item.tone === 'success' ? (
              <CheckCircle2 />
            ) : (
              <Info />
            )}
            <div className="toast-content">
              <Toast.Description>{item.message}</Toast.Description>
              {item.action ? (
                <Toast.Action asChild altText={item.action.label}>
                  <button onClick={item.action.onClick}>
                    {item.action.label}
                  </button>
                </Toast.Action>
              ) : null}
            </div>
            <Toast.Close className="toast-close" aria-label="Đóng thông báo">
              <X size={16} />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport
          className="toast-viewport"
          label="Thông báo ({hotkey})"
        />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
