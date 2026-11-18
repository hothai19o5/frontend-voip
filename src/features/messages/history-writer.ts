import type { ChatMessage } from './message-store'

export interface HistoryWrite {
  account: string
  peer: string
  name: string
  direction: ChatMessage['direction']
  body: string
  status: Exclude<ChatMessage['status'], 'unknown'>
  time: number
  senderName?: string
}

// Keep the latest version per id while requests run serially. A late pending
// save cannot delete a queued acknowledgment. Failed PUTs are safe to retry.
export class HistoryWriter<T = HistoryWrite> {
  private queue = new Map<string, T>()
  private running = false
  private active = true
  private save: (id: string, message: T) => Promise<unknown>
  private result: (id: string, status: 'saving' | 'saved' | 'failed') => void
  private failure: () => void
  constructor(
    save: (id: string, message: T) => Promise<unknown>,
    result: (id: string, status: 'saving' | 'saved' | 'failed') => void,
    failure: () => void,
  ) {
    this.save = save
    this.result = result
    this.failure = failure
  }

  enqueue(id: string, message: T) {
    this.queue.set(id, message)
    this.result(id, 'saving')
    void this.flush()
  }

  retry() {
    void this.flush()
  }

  stop() {
    this.active = false
    this.queue.clear()
  }

  async flush() {
    if (this.running || !this.active) return
    this.running = true
    try {
      while (this.active && this.queue.size) {
        const [id, message] = this.queue.entries().next().value!
        try {
          await this.save(id, message)
        } catch {
          if (this.active) {
            for (const pendingId of this.queue.keys())
              this.result(pendingId, 'failed')
            this.failure()
          }
          break
        }
        if (this.active && this.queue.get(id) === message) {
          this.queue.delete(id)
          this.result(id, 'saved')
        }
      }
    } finally {
      this.running = false
    }
  }
}
