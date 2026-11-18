let sequence = 0

// Only for in-memory UI/message IDs, never authentication tokens or secrets.
export function createLocalId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // HTTP LAN origins do not expose randomUUID. A counter avoids collisions
  // within this app instance even when multiple events share a timestamp.
  return `local-${Date.now().toString(36)}-${(++sequence).toString(36)}`
}
