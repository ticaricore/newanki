import { useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { useCreateCategory, useDeleteCategory, usePatchCategory } from '@/api/queries'
import type { CategoryDTO } from '@/api/types.gen'
import { Button, Label } from '@/components/ui/glass'
import { FormError, TextInput } from '@/components/ui/form'
import { CATEGORY_COLORS } from '@/components/ui/categories'
import { Sheet } from '@/components/ui/Sheet'

/** Create, rename, recolor or delete a deck category. */
export function CategorySheet({
  open, onOpenChange, category, nextColor,
}: { open: boolean; onOpenChange: (o: boolean) => void; category?: CategoryDTO; nextColor?: string }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0]!)
  const [confirm, setConfirm] = useState(false)
  const create = useCreateCategory()
  const patch = usePatchCategory()
  const del = useDeleteCategory()
  const m = category ? patch : create

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setColor(category?.color ?? nextColor ?? CATEGORY_COLORS[0]!)
    setConfirm(false)
    create.reset()
    patch.reset()
    del.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category])

  const save = async () => {
    const body = { name: name.trim(), color }
    if (category) await patch.mutateAsync({ uid: category.uid, ...body })
    else await create.mutateAsync(body)
    onOpenChange(false)
  }
  const remove = async () => {
    if (!category) return
    await del.mutateAsync(category.uid)
    onOpenChange(false)
  }
  const err = (m.error ?? del.error) instanceof ApiError ? ((m.error ?? del.error) as ApiError) : null
  const decks = category?.deck_count ?? 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={category ? 'Kategoriyi düzenle' : 'Yeni kategori'}>
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save().catch(() => {})
        }}
      >
        <TextInput label="Kategori adı" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Fransızca" autoFocus={!category} error={err?.fields.name} maxLength={40} />

        <div>
          <Label>Renk</Label>
          <div className="flex flex-wrap gap-2.5">
            {CATEGORY_COLORS.map((c) => (
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

        <FormError message={err && !err.fields.name ? err.message : null} />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!name.trim() || m.isPending}>
          {m.isPending ? 'Kaydediliyor…' : category ? 'Kaydet' : 'Kategoriyi ekle'}
        </Button>

        {category ? (
          confirm ? (
            <div className="flex flex-col gap-2">
              <div className="text-center text-xs text-na-text-3">
                {decks > 0 ? `${decks} deste kategorisiz kalacak; desteler ve kartlar silinmez.` : 'Bu kategoriyi kullanan deste yok.'}
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setConfirm(false)}>Vazgeç</Button>
                <Button variant="danger" className="flex-1" disabled={del.isPending} onClick={() => void remove().catch(() => {})}>
                  {del.isPending ? 'Siliniyor…' : 'Sil'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" icon="trash" className="w-full" style={{ color: 'var(--na-danger)' }} onClick={() => setConfirm(true)}>
              Kategoriyi sil
            </Button>
          )
        ) : null}
      </form>
    </Sheet>
  )
}
