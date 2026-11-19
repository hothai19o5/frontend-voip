export function dialableNumber(input: string) {
  const compact = input.replace(/[\p{Zs}()-]/gu, '')
  return /^\+?[0-9]{3,15}$/.test(compact) ? compact : null
}

export function isPstnPeer(peer: string, phoneNumber?: string) {
  const number = /^sips?:(\+[1-9][0-9]{2,14})@/i.exec(peer)?.[1]
  return !!number && (phoneNumber === undefined || number === phoneNumber)
}
