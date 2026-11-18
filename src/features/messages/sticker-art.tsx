import sheet from '../../assets/stickers/sprout-sheet-v1.webp'
import type { Sticker } from './message-content'

export function StickerArt({ sticker }: { sticker: Sticker }) {
  return (
    <span
      className="sticker-art"
      role="img"
      aria-label={`Sticker ${sticker.label}`}
      style={{
        backgroundImage: `url(${sheet})`,
        backgroundPosition: `${sticker.column * 50}% ${sticker.row * 100}%`,
      }}
    />
  )
}
