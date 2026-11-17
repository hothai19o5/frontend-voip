import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import type { UserPage } from '../../lib/contracts'
import { useToast } from '../../components/toast-context'

export function useDirectory(
  token: string,
  q: string,
  page: number,
  revision: number,
) {
  const notify = useToast()
  const key = JSON.stringify([token, q, page, revision])
  const [result, setResult] = useState<{
    key: string
    data: UserPage | null
    failed: boolean
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void api
      .users(token, q, page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data, failed: false })
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setResult({ key, data: null, failed: true })
        notify({ message: errorMessage(cause), tone: 'error' })
      })
    return () => controller.abort()
  }, [token, q, page, key, notify])
  return result?.key === key
    ? { ...result, loading: false }
    : { data: null, failed: false, loading: true }
}
