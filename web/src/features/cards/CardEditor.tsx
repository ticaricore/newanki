import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import { decksQuery, useCreateCard, useDeleteCard, usePatchCard } from '@/api/queries'
import type { CardDTO, CardFields } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, CategoryDot, Field, Label } from '@/components/ui/glass'
import { FormError, TextArea, TextInput, firstError } from '@/components/ui/form'
import { CARD_TYPES, tint, type CardType } from '@/components/ui/categories'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Sheet } from '@/components/ui/Sheet'
import { DeckSheet } from '@/features/decks/DeckSheet'
import { AudioRecorder, ImagePicker } from './MediaInputs'

interface Values {
  type: CardType
  deck_uid: string
  front: string
  back: string
  fields: CardFields
}

const required = (msg: string) => ({ value }: { value: string | undefined }) => (!value?.trim() ? msg : undefined)

/** Create (no `card`) or edit a card. Layout follows the design's create.jsx. */
export function CardEditor({ card, defaultDeckUid, onClose, onSaved }: { card?: CardDTO; defaultDeckUid?: string; onClose: () => void; onSaved: (c: CardDTO, another: boolean) => void }) {
  const { data: decks = [] } = useQuery(decksQuery)
  const create = useCreateCard()
  const patch = usePatchCard()
  const del = useDeleteCard()
  const [deckPicker, setDeckPicker] = useState(false)
  const [newDeck, setNewDeck] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [another, setAnother] = useState(false)
  const m = card ? patch : create
  const err = m.error instanceof ApiError ? m.error : null

  const form = useForm({
    defaultValues: {
      type: (card?.type as CardType) ?? 'word',
      deck_uid: card?.deck_uid ?? defaultDeckUid ?? decks[0]?.uid ?? '',
      front: card?.front ?? '',
      back: card?.back ?? '',
      fields: card?.fields ?? {},
    } as Values,
    onSubmit: async ({ value, formApi }) => {
      const body = { deck_uid: value.deck_uid, front: value.front, back: value.back, fields: value.fields }
      const saved = card ? await patch.mutateAsync({ uid: card.uid, ...body }) : await create.mutateAsync({ ...body, type: value.type })
      if (!card && another) {
        formApi.reset({ ...value, front: '', back: '', fields: value.type === 'word' ? { lang: value.fields.lang } : {} })
        create.reset()
      }
      onSaved(saved, another)
    },
  })

  const save = (more: boolean) => {
    setAnother(more)
    void form.handleSubmit()
  }

  return (
    <div className="na-enter relative z-[1] pb-8">
      <TopBar
        title={card ? 'Kartı düzenle' : 'Yeni kart'}
        leading={<TopBarIcon name="close" label="Kapat" onClick={onClose} />}
        trailing={
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => <Button size="sm" variant="primary" onClick={() => save(false)} disabled={busy}>{busy ? '…' : 'Kaydet'}</Button>}
          </form.Subscribe>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
      >
        {/* Type strip (fixed when editing) */}
        <form.Field name="type">
          {(f) => (
            <div className="px-[18px] pt-1">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
                {(Object.keys(CARD_TYPES) as CardType[]).map((k) => {
                  const t = CARD_TYPES[k]
                  const active = k === f.state.value
                  if (card && !active) return null
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!!card}
                      onClick={() => f.handleChange(k)}
                      aria-pressed={active}
                      className="na-glass min-w-[110px] shrink-0 p-3 text-left disabled:opacity-100"
                      style={{ borderRadius: 16, background: active ? tint(t.color, 18) : undefined, borderColor: active ? tint(t.color, 40) : undefined }}
                    >
                      <div className="mb-2 flex h-[30px] w-[30px] items-center justify-center rounded-[9px]" style={{ background: tint(t.color, active ? 30 : 18), color: t.color }}>
                        <Icon name={t.icon} size={15} strokeWidth={2} />
                      </div>
                      <div className="text-[13px] font-semibold">{t.label}</div>
                      <div className="mt-0.5 text-[10px] leading-tight text-na-text-3">{t.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </form.Field>

        {/* Deck selector */}
        <form.Field name="deck_uid" validators={{ onSubmit: required('Bir deste seçin') }}>
          {(f) => {
            const d = decks.find((x) => x.uid === f.state.value)
            return (
              <div className="px-[18px] pt-4">
                <Field label="Deste" error={firstError(f.state.meta.errors, err?.fields.deck_uid)}>
                  <button type="button" onClick={() => setDeckPicker(true)} className="na-glass flex w-full items-center gap-2.5 px-3.5 py-3 text-left" style={{ borderRadius: 14 }}>
                    {d ? <CategoryDot color={d.color} /> : <Icon name="layers" size={16} color="var(--na-text-3)" />}
                    <span className={`flex-1 text-sm font-medium ${d ? '' : 'text-na-text-3'}`}>{d?.name ?? 'Deste seç'}</span>
                    <Icon name="chevronD" size={16} color="var(--na-text-3)" />
                  </button>
                </Field>
                <Sheet open={deckPicker} onOpenChange={setDeckPicker} title="Deste seç">
                  <div className="flex flex-col gap-2 pb-2">
                    {decks.map((x) => (
                      <button
                        key={x.uid}
                        type="button"
                        onClick={() => {
                          f.handleChange(x.uid)
                          setDeckPicker(false)
                        }}
                        className="na-glass flex items-center gap-2.5 px-3.5 py-3 text-left"
                        style={{ borderRadius: 14, borderColor: x.uid === f.state.value ? 'var(--na-accent-border)' : undefined }}
                      >
                        <CategoryDot color={x.color} />
                        <span className="flex-1 text-sm font-medium">{x.name}</span>
                        {x.uid === f.state.value ? <Icon name="check" size={16} color="var(--na-accent)" /> : null}
                      </button>
                    ))}
                    <Button icon="plus" className="w-full" onClick={() => { setDeckPicker(false); setNewDeck(true) }}>Yeni deste</Button>
                  </div>
                </Sheet>
                <DeckSheet open={newDeck} onOpenChange={setNewDeck} onSaved={(d) => f.handleChange(d.uid)} />
              </div>
            )
          }}
        </form.Field>

        {/* AI generation */}
        {!card ? (
          <form.Subscribe selector={(s) => s.values.deck_uid}>
            {(deckUid) => (
              <div className="px-[18px] pt-3.5">
                <Link
                  to="/ai"
                  search={{ deck_uid: deckUid || undefined }}
                  className="na-glass na-glass--strong flex w-full items-center gap-2.5 px-3.5 py-3 text-na-text no-underline"
                  style={{ borderRadius: 14, background: 'linear-gradient(90deg, rgba(167,139,250,0.16), rgba(96,165,250,0.12))', borderColor: 'rgba(167,139,250,0.30)' }}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'rgba(167,139,250,0.25)', color: '#A78BFA' }}><Icon name="sparkle" size={14} strokeWidth={2} /></div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">AI ile otomatik üret</div>
                    <div className="mt-px text-[11px] text-na-text-3">Bir kelime veya konu yaz · kartları öner</div>
                  </div>
                  <Icon name="chevronR" size={16} color="var(--na-text-3)" />
                </Link>
              </div>
            )}
          </form.Subscribe>
        ) : null}

        {/* Type-specific fields */}
        <form.Subscribe selector={(s) => s.values.type}>
          {(type) => (
            <div className="flex flex-col gap-4 px-[18px] pt-5">
              {type === 'word' && (
                <>
                  <form.Field name="front" validators={{ onSubmit: required('Ön yüz boş olamaz') }}>
                    {(f) => <TextInput label="Ön yüz · Kelime" name="front" placeholder="serendipity" autoCapitalize="none" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.front)} />}
                  </form.Field>
                  <div className="grid grid-cols-[1fr_110px] gap-2">
                    <form.Field name="fields.ipa">
                      {(f) => <TextInput label="Telaffuz (IPA)" name="ipa" placeholder="/ˌsɛrənˈdɪpɪti/" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                    </form.Field>
                    <form.Field name="fields.lang">
                      {(f) => <TextInput label="Dil" name="lang" placeholder="en→tr" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                    </form.Field>
                  </div>
                  <form.Field name="fields.pos">
                    {(f) => <TextInput label="Tür / not" name="pos" placeholder="noun, adj, plural…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="back" validators={{ onSubmit: required('Arka yüz boş olamaz') }}>
                    {(f) => <TextArea label="Arka yüz · Anlam" name="back" placeholder="tesadüfi keşif; aramadığını bulma şansı" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.back)} />}
                  </form.Field>
                  <form.Field name="fields.example">
                    {(f) => <TextArea label="Örnek cümle" name="example" placeholder="A serendipitous encounter at the library…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="fields.example_tr">
                    {(f) => <TextArea label="Örnek cümlenin çevirisi" name="example_tr" rows={2} placeholder="Kütüphanede tesadüfi bir karşılaşma…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="fields.synonyms">
                    {(f) => <TextInput label="Eş anlamlılar" name="synonyms" placeholder="chance, fluke, fortuity" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                </>
              )}
              {type === 'audio' && (
                <>
                  <form.Field name="fields.media_uid">
                    {(f) => (
                      <Field label="Ses kaydı" error={err?.fields['fields.media_uid']}>
                        <AudioRecorder value={f.state.value} onChange={(uid, secs) => { f.handleChange(uid); if (secs) form.setFieldValue('fields.duration', secs) }} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="front">
                    {(f) => <TextInput label="Soru (isteğe bağlı)" name="front" placeholder="Ne duyuyorsun?" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="back" validators={{ onSubmit: required('Yazılı cevap boş olamaz') }}>
                    {(f) => <TextArea label="Yazılı cevap (dikte)" name="back" rows={3} placeholder="Cümlenin yazılı hali…" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.back)} />}
                  </form.Field>
                </>
              )}
              {type === 'image' && (
                <>
                  <form.Field name="fields.media_uid">
                    {(f) => (
                      <Field label="Görsel" error={err?.fields['fields.media_uid']}>
                        <ImagePicker value={f.state.value} onChange={(uid) => f.handleChange(uid)} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="front" validators={{ onSubmit: required('Soru boş olamaz') }}>
                    {(f) => <TextInput label="Soru" name="front" placeholder="Bu organel ne?" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.front)} />}
                  </form.Field>
                  <form.Field name="back" validators={{ onSubmit: required('Cevap boş olamaz') }}>
                    {(f) => <TextInput label="Cevap" name="back" placeholder="Mitokondri" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.back)} />}
                  </form.Field>
                  <form.Field name="fields.extra">
                    {(f) => <TextArea label="Açıklama" name="extra" placeholder="Hücrenin enerji üreten organeli…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                </>
              )}
              {type === 'quran' && (
                <>
                  <div>
                    <Label>Sûre · Âyet</Label>
                    <div className="grid grid-cols-[2fr_1fr] gap-2">
                      <form.Field name="fields.sure">
                        {(f) => <input className="na-input" aria-label="Sûre" placeholder="Bakara" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                      </form.Field>
                      <form.Field name="fields.ayah">
                        {(f) => <input className="na-input" aria-label="Âyet" placeholder="1–2" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                      </form.Field>
                    </div>
                  </div>
                  <form.Field name="fields.arabic">
                    {(f) => (
                      <TextArea label="Arapça" name="arabic" dir="rtl" lang="ar" rows={2} placeholder="الٓمٓ ۚ ذَٰلِكَ ٱلْكِتَـٰبُ…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)}
                        error={err?.fields['fields.arabic']} style={{ fontFamily: 'var(--na-font-arabic)', fontSize: 20, lineHeight: 1.8 }} />
                    )}
                  </form.Field>
                  <form.Field name="fields.translit">
                    {(f) => <TextArea label="Okunuş" name="translit" placeholder="Elif, Lām, Mīm…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="fields.meal">
                    {(f) => <TextArea label="Meal" name="meal" placeholder="Elif, Lâm, Mîm. İşte o Kitap…" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="fields.tefsir">
                    {(f) => <TextArea label="Tefsir özeti" name="tefsir" rows={3} value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                  <form.Field name="fields.reciter">
                    {(f) => <TextInput label="Kâri" name="reciter" placeholder="Mishary Rashid Alafasy" value={f.state.value ?? ''} onChange={(e) => f.handleChange(e.target.value)} />}
                  </form.Field>
                </>
              )}
            </div>
          )}
        </form.Subscribe>

        <div className="flex flex-col gap-2.5 px-[18px] pt-6">
          <FormError message={err && Object.keys(err.fields).length === 0 ? err.message : null} />
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <>
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{card ? 'Değişiklikleri kaydet' : 'Kaydet'}</Button>
                {!card ? <Button size="lg" className="w-full" onClick={() => save(true)} disabled={busy}>Kaydet ve yeni kart</Button> : null}
              </>
            )}
          </form.Subscribe>
          {card ? <Button variant="danger" icon="trash" className="w-full" onClick={() => setConfirmDelete(true)}>Kartı sil</Button> : null}
        </div>
      </form>

      {card ? (
        <ConfirmSheet
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Kart silinsin mi?"
          description="Bu kart destelerden ve çalışma kuyruğundan kaldırılır."
          confirmLabel="Kartı sil"
          busy={del.isPending}
          onConfirm={() => del.mutate(card.uid, { onSuccess: onClose })}
        />
      ) : null}
    </div>
  )
}
