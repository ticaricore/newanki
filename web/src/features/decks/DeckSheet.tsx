import { useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { useCreateDeck, usePatchDeck } from '@/api/queries'
import type { DeckDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { Button, Label } from '@/components/ui/glass'
import { FormError, TextInput } from '@/components/ui/form'
import { NA_CAT, tint } from '@/components/ui/categories'
import { Sheet } from '@/components/ui/Sheet'
import { DECK_COLORS, DECK_ICONS } from './deckIcon'

/** Create or edit a deck in a bottom sheet. */
export function DeckSheet({
  open, onOpenChange, deck, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; deck?: DeckDTO; onSaved?: (d: DeckDTO) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [color, setColor] = useState(DECK_COLORS[0]!)
  const [icon, setIcon] = useState('textT')
  const create = useCreateDeck()
  const patch = usePatchDeck()
  const m = deck ? patch : create

  useEffect(() => {
    if (!open) return
    setName(deck?.name ?? '')
    setCategory(deck?.category ?? '')
    setColor(deck?.color ?? DECK_COLORS[0]!)
    setIcon(deck?.icon || 'textT')
    create.reset()
    patch.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck])

  const pickCategory = (k: string) => {
    setCategory(k === category ? '' : k)
    const c = NA_CAT[k]?.color
    if (c && k !== category) setColor(c)
  }

  const save = async () => {
    const body = { name: name.trim(), category, color, icon }
    const d = deck ? await patch.mutateAsync({ uid: deck.uid, ...body }) : await create.mutateAsync(body)
    onSaved?.(d)
    onOpenChange(false)
  }
  const err = m.error instanceof ApiError ? m.error : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={deck ? 'Desteyi düzenle' : 'Yeni deste'}>
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save().catch(() => {})
        }}
      >
        <TextInput label="Deste adı" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. English B2 — Academic" autoFocus={!deck} error={err?.fields.name} maxLength={120} />

        <div>
          <Label>Kategori</Label>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {Object.entries(NA_CAT).map(([k, c]) => {
              const active = k === category
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickCategory(k)}
                  className="na-glass inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-xs font-semibold"
                  style={{ borderRadius: 999, background: active ? tint(c.color, 18) : undefined, borderColor: active ? tint(c.color, 40) : undefined, color: active ? c.color : 'var(--na-text-2)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <Label>Renk</Label>
          <div className="flex flex-wrap gap-2.5">
            {DECK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Renk ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className="h-9 w-9 rounded-full border-0"
                style={{ background: c, boxShadow: c === color ? `0 0 0 2px var(--na-bg-0), 0 0 0 4px ${c}` : 'none' }}
              />
            ))}
          </div>
        </div>

        <div>
          <Label>İkon</Label>
          <div className="flex flex-wrap gap-2">
            {DECK_ICONS.map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i}
                aria-pressed={i === icon}
                onClick={() => setIcon(i)}
                className="na-glass flex h-11 w-11 items-center justify-center"
                style={{ borderRadius: 13, background: i === icon ? tint(color, 22) : undefined, color: i === icon ? color : 'var(--na-text-3)', borderColor: i === icon ? tint(color, 45) : undefined }}
              >
                <Icon name={i} size={18} strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>

        <FormError message={err && !err.fields.name ? err.message : null} />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!name.trim() || m.isPending}>
          {m.isPending ? 'Kaydediliyor…' : deck ? 'Kaydet' : 'Desteyi oluştur'}
        </Button>
      </form>
    </Sheet>
  )
}
