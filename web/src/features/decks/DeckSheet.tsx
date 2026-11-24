import { useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { useCreateCategory, useCreateDeck, usePatchDeck } from '@/api/queries'
import type { DeckDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { Button, Label } from '@/components/ui/glass'
import { FormError, TextInput } from '@/components/ui/form'
import { tint } from '@/components/ui/categories'
import { Sheet } from '@/components/ui/Sheet'
import { DECK_COLORS, DECK_ICONS } from './deckIcon'
import { useCategories } from './useCategories'

/** Create or edit a deck in a bottom sheet. */
export function DeckSheet({
  open, onOpenChange, deck, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; deck?: DeckDTO; onSaved?: (d: DeckDTO) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [color, setColor] = useState(DECK_COLORS[0]!)
  const [icon, setIcon] = useState('textT')
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState('')
  const categories = useCategories()
  const createCat = useCreateCategory()
  const create = useCreateDeck()
  const patch = usePatchDeck()
  const m = deck ? patch : create

  useEffect(() => {
    if (!open) return
    setName(deck?.name ?? '')
    setCategory(deck?.category ?? '')
    setColor(deck?.color ?? DECK_COLORS[0]!)
    setIcon(deck?.icon || 'textT')
    setAdding(false)
    setNewCat('')
    create.reset()
    patch.reset()
    createCat.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck])

  const pickCategory = (k: string) => setCategory(k === category ? '' : k)

  const addCategory = async () => {
    const c = await createCat.mutateAsync({ name: newCat.trim() })
    setCategory(c.uid)
    setAdding(false)
    setNewCat('')
  }
  const catErr = createCat.error instanceof ApiError ? createCat.error : null

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
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-1">
            {categories.list.map((c) => {
              const active = c.uid === category
              return (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => pickCategory(c.uid)}
                  aria-pressed={active}
                  className="na-glass inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-xs font-semibold"
                  style={{ borderRadius: 999, background: active ? tint(c.color, 18) : undefined, borderColor: active ? tint(c.color, 40) : undefined, color: active ? c.color : 'var(--na-text-2)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </button>
              )
            })}
            {!adding ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="na-glass inline-flex shrink-0 items-center gap-1 px-3.5 py-2 text-xs font-semibold"
                style={{ borderRadius: 999, color: 'var(--na-text-3)', borderStyle: 'dashed' }}
              >
                <Icon name="plus" size={13} strokeWidth={2.2} />
                Yeni
              </button>
            ) : null}
          </div>
          {adding ? (
            <div className="mt-2 flex items-start gap-2">
              <div className="flex-1">
                <TextInput
                  label="Yeni kategori"
                  name="new-category"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (newCat.trim()) void addCategory().catch(() => {})
                  }}
                  placeholder="ör. Fransızca"
                  maxLength={40}
                  autoFocus
                  error={catErr ? catErr.fields.name ?? catErr.message : undefined}
                />
              </div>
              <Button className="mt-[22px]" disabled={!newCat.trim() || createCat.isPending} onClick={() => void addCategory().catch(() => {})}>
                {createCat.isPending ? '…' : 'Ekle'}
              </Button>
              <Button variant="ghost" iconOnly icon="close" aria-label="Vazgeç" className="mt-[22px]" onClick={() => { setAdding(false); setNewCat(''); createCat.reset() }} />
            </div>
          ) : null}
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
