export const STICKERS = [
  {
    id: 'wave',
    label: 'Xin chào',
    fallback: '👋 Xin chào!',
    column: 0,
    row: 0,
  },
  {
    id: 'love',
    label: 'Yêu thương',
    fallback: '❤️ Gửi yêu thương!',
    column: 1,
    row: 0,
  },
  {
    id: 'laugh',
    label: 'Cười vui',
    fallback: '😂 Vui quá!',
    column: 2,
    row: 0,
  },
  {
    id: 'thanks',
    label: 'Cảm ơn',
    fallback: '🙏 Cảm ơn bạn!',
    column: 0,
    row: 1,
  },
  {
    id: 'sad',
    label: 'Buồn rồi',
    fallback: '😢 Buồn rồi...',
    column: 1,
    row: 1,
  },
  {
    id: 'party',
    label: 'Chúc mừng',
    fallback: '🎉 Chúc mừng!',
    column: 2,
    row: 1,
  },
] as const

export type Sticker = (typeof STICKERS)[number]

// Keep SIP text/plain and history's existing body field. Other SIP clients see
// a readable fallback; VoIP only renders an exact, known catalog entry.
export function stickerBody(sticker: Sticker) {
  return `[[voip:sticker:v1:${sticker.id}]] ${sticker.fallback}`
}

export function parseSticker(body: string) {
  if (!body.startsWith('[[voip:sticker:v1:')) return undefined
  return STICKERS.find((sticker) => stickerBody(sticker) === body)
}

export function messagePreview(body: string) {
  const sticker = parseSticker(body)
  return sticker ? `Sticker · ${sticker.label}` : body
}

export function insertExpression(
  value: string,
  text: string,
  start: number,
  end: number,
  limit = 5000,
) {
  const from = Math.max(0, Math.min(start, value.length))
  const to = Math.max(from, Math.min(end, value.length))
  const next = value.slice(0, from) + text + value.slice(to)
  if (next.length > limit) return null
  return { value: next, caret: from + text.length }
}

export function isEmojiOnly(body: string) {
  const text = body.trim()
  const emoji = text.match(
    /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3/gu,
  )
  return Boolean(
    emoji?.length &&
    emoji.length <= 6 &&
    /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3|[#*0-9]\uFE0F?\u20E3|\s)+$/u.test(
      text,
    ),
  )
}
