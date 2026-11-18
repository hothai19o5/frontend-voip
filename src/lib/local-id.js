let sequence = 0

// For UI and message IDs, never authentication tokens or secrets.
export function createLocalId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // HTTP LAN origins still offer random bytes for IDs shared across devices.
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    return Array.from(
      globalThis.crypto.getRandomValues(new Uint32Array(4)),
      (word) => word.toString(16).padStart(8, '0'),
    ).join('')
  }
  return `local-${Date.now().toString(36)}-${(++sequence).toString(36)}`
}
