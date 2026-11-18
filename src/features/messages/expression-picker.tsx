import { useState } from 'react'
import { Popover, Tabs } from 'radix-ui'
import { Search, Smile, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { EMOJI_GROUPS, EMOTES, expressionSearch } from './expression-catalog'
import { STICKERS } from './message-content'
import type { Sticker } from './message-content'
import { StickerArt } from './sticker-art'

export function ExpressionPicker({
  disabled,
  sending,
  insert,
  sendSticker,
}: {
  disabled: boolean
  sending: boolean
  insert: (value: string) => boolean
  sendSticker: (sticker: Sticker) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('emoji')
  function changeOpen(value: boolean) {
    setOpen(value)
    if (!value) setQuery('')
  }
  function selectText(value: string) {
    if (insert(value)) changeOpen(false)
  }
  const groups = EMOJI_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(([emoji, label]) =>
      expressionSearch(`${emoji} ${label}`, query),
    ),
  })).filter((group) => group.items.length)
  const emotes = EMOTES.filter(([value, label]) =>
    expressionSearch(`${value} ${label}`, query),
  )
  const stickers = STICKERS.filter((item) =>
    expressionSearch(`${item.label} ${item.fallback}`, query),
  )
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="composer-tool"
          aria-label="Chọn biểu cảm"
          title="Emoji, emote và sticker"
          disabled={disabled}
        >
          <Smile />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="expression-picker"
          side="top"
          align="start"
          sideOffset={12}
          collisionPadding={12}
          aria-label="Biểu cảm và sticker"
          onCloseAutoFocus={(event) => {
            if (document.activeElement?.id === 'message-draft')
              event.preventDefault()
          }}
        >
          <div className="expression-heading">
            <strong>Thêm chút cảm xúc</strong>
            <Popover.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Đóng bảng biểu cảm"
              >
                <X />
              </Button>
            </Popover.Close>
          </div>
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List className="expression-tabs" aria-label="Loại biểu cảm">
              <Tabs.Trigger value="emoji">Emoji</Tabs.Trigger>
              <Tabs.Trigger value="emote">Emote</Tabs.Trigger>
              <Tabs.Trigger value="sticker">Sticker</Tabs.Trigger>
            </Tabs.List>
            <label className="expression-search">
              <Search aria-hidden="true" />
              <Input
                aria-label="Tìm biểu cảm"
                placeholder="Tìm biểu cảm…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <Tabs.Content value="emoji" className="expression-content">
              {groups.length ? (
                groups.map((group) => (
                  <section key={group.name} aria-label={group.name}>
                    <h3>{group.name}</h3>
                    <div className="emoji-grid">
                      {group.items.map(([emoji, label]) => (
                        <button
                          key={emoji}
                          type="button"
                          className="emoji-option"
                          aria-label={`Chèn ${label}`}
                          title={label}
                          disabled={disabled}
                          onClick={() => selectText(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="expression-empty">Không tìm thấy emoji.</p>
              )}
            </Tabs.Content>
            <Tabs.Content value="emote" className="expression-content">
              <div className="emote-grid">
                {emotes.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="emote-option"
                    aria-label={`Chèn emote ${label}`}
                    title={label}
                    disabled={disabled}
                    onClick={() => selectText(value)}
                  >
                    <span>{value}</span>
                    <small>{label}</small>
                  </button>
                ))}
              </div>
              {!emotes.length ? (
                <p className="expression-empty">Không tìm thấy emote.</p>
              ) : null}
            </Tabs.Content>
            <Tabs.Content value="sticker" className="expression-content">
              <h3>Mầm nhỏ</h3>
              <p className="sticker-picker-hint" role="status">
                {sending ? 'Đang gửi sticker…' : 'Chọn sticker để gửi ngay.'}
              </p>
              <div className="sticker-grid">
                {stickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    type="button"
                    className="sticker-option"
                    aria-label={`Gửi sticker ${sticker.label}`}
                    title={sticker.label}
                    disabled={disabled || sending}
                    onClick={async () => {
                      if (await sendSticker(sticker)) changeOpen(false)
                    }}
                  >
                    <StickerArt sticker={sticker} />
                  </button>
                ))}
              </div>
              {!stickers.length ? (
                <p className="expression-empty">Không tìm thấy sticker.</p>
              ) : null}
            </Tabs.Content>
          </Tabs.Root>
          <Popover.Arrow className="expression-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
