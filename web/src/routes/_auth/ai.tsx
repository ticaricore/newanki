import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { ApiError, api, uuidv7 } from '@/api/client'
import { aiStatusQuery, decksQuery, qk, useAIGenerate } from '@/api/queries'
import type { AICard, AIGenerateRequest, CardDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, EmptyState, GlassSegment, Pill, Spinner } from '@/components/ui/glass'
import { canSpeak, speak, speechLang } from '@/features/study/speech'

export const Route = createFileRoute('/_auth/ai')({
  validateSearch: (s: Record<string, unknown>): { deck_uid?: string } => ({ deck_uid: typeof s.deck_uid === 'string' ? s.deck_uid : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(decksQuery),
  component: AIScreen,
})

type Mode = 'word' | 'list'

const LANGS = [
  { code: 'en', label: 'İngilizce' },
  { code: 'de', label: 'Almanca' },
  { code: 'fr', label: 'Fransızca' },
  { code: 'es', label: 'İspanyolca' },
  { code: 'it', label: 'İtalyanca' },
  { code: 'ar', label: 'Arapça' },
  { code: 'ru', label: 'Rusça' },
  { code: 'ja', label: 'Japonca' },
  { code: 'tr', label: 'Türkçe' },
]
const COUNTS = [5, 10, 20, 30]

interface Prefs {
  mode: Mode
  src: string
  tgt: string
  count: number
  deck?: string
}
const PREFS_KEY = 'na:ai'

function loadPrefs(): Prefs {
  try {
    return { mode: 'word', src: 'en', tgt: 'tr', count: 10, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { mode: 'word', src: 'en', tgt: 'tr', count: 10 }
  }
}

function AIScreen() {
  const search = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate()
  const close = () => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/decks' }))
  const status = useQuery(aiStatusQuery)

  const blocked = status.data && !status.data.available && status.data.reason !== 'limit'
  return (
    <AppShell>
      <TopBar
        title="AI ile üret"
        leading={<TopBarIcon name="close" label="Kapat" onClick={close} />}
        trailing={status.data?.available ? <Pill tone="purple" icon="sparkle">{status.data.remaining_today} hak</Pill> : null}
      />
      {status.isPending ? (
        <div className="flex justify-center pt-24"><Spinner size={22} /></div>
      ) : status.isError ? (
        <div className="px-[18px] pt-10">
          <EmptyState icon="wifiOff" title="Bağlantı gerekiyor" action={<Button variant="primary" onClick={() => status.refetch()}>Tekrar dene</Button>}>
            AI ile kart üretmek için internete bağlı olmalısın.
          </EmptyState>
        </div>
      ) : blocked ? (
        <div className="px-[18px] pt-10">
          <EmptyState icon="sparkle" title={status.data.reason === 'disabled' ? 'AI kapalı' : 'AI hazır değil'}>
            {status.data.reason === 'disabled'
              ? 'Yönetici AI ile kart üretmeyi bu sunucuda kapattı.'
              : 'Bu sunucuda AI ile üretim yapılandırılmamış. Yöneticinden bir AI API anahtarı (Claude veya DeepSeek) eklemesini iste.'}
          </EmptyState>
        </div>
      ) : (
        <Generator defaultDeck={search.deck_uid} limitReached={status.data?.reason === 'limit'} />
      )}
    </AppShell>
  )
}

function Generator({ defaultDeck, limitReached }: { defaultDeck?: string; limitReached: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: decks = [] } = useQuery(decksQuery)
  const [prefs, setPrefsState] = useState(loadPrefs)
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p }
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      return next
    })
  const initialDeck = [defaultDeck, prefs.deck].find((u) => u && decks.some((d) => d.uid === u)) ?? decks[0]?.uid ?? ''
  const [deckUid, setDeckUid] = useState(initialDeck)
  const [input, setInput] = useState('')
  const [cards, setCards] = useState<AICard[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const gen = useAIGenerate()
  const resultRef = useRef<HTMLDivElement>(null)

  const deck = decks.find((d) => d.uid === deckUid)
  const err = gen.error instanceof ApiError ? gen.error : null
  const thinking = gen.isPending

  const generate = () => {
    const text = input.trim()
    if (!text || thinking) return
    setSaved(null)
    setSaveError(null)
    const body: AIGenerateRequest = { mode: prefs.mode, input: text, source_lang: prefs.src, target_lang: prefs.tgt }
    if (prefs.mode === 'list') {
      body.count = prefs.count
      if (deckUid) body.deck_uid = deckUid
    }
    gen.mutate(body, {
      onSuccess: (res) => {
        setCards(res.cards)
        setSelected(new Set(res.cards.flatMap((c, i) => (c.exists ? [] : [i]))))
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      },
    })
  }

  const save = async (list: AICard[]) => {
    if (!deckUid || list.length === 0) return
    setSaveError(null)
    setSaving({ done: 0, total: list.length })
    let done = 0
    try {
      for (const c of list) {
        await api<CardDTO>('POST', '/cards', { uid: uuidv7(), deck_uid: deckUid, type: 'word', front: c.front, back: c.back, fields: c.fields })
        done++
        setSaving({ done, total: list.length })
      }
      navigator.vibrate?.(8)
      setSaved(done)
      setCards([])
    } catch (e) {
      setSaveError(`${done}/${list.length} kart eklendi. ${(e as Error).message}`)
    } finally {
      setSaving(null)
      void qc.invalidateQueries({ queryKey: qk.decks })
      void qc.invalidateQueries({ queryKey: ['cards'] })
      void qc.invalidateQueries({ queryKey: qk.stats })
    }
  }

  const reset = () => {
    setSaved(null)
    setCards([])
    setInput('')
    gen.reset()
  }

  return (
    <div className="na-enter flex flex-col gap-3.5 px-[18px] pb-10">
      <GlassSegment<Mode>
        full
        ariaLabel="Üretim türü"
        value={prefs.mode}
        onChange={(m) => {
          setPrefs({ mode: m })
          setInput('')
          setCards([])
          setSaved(null)
          gen.reset()
        }}
        options={[{ value: 'word', label: 'Tek kelime' }, { value: 'list', label: 'Konu veya metin' }]}
      />

      {/* Source */}
      <div className="na-glass na-glass--strong relative overflow-hidden p-4" style={{ borderRadius: 20 }}>
        <div aria-hidden className="pointer-events-none absolute -top-5 -right-5 h-[120px] w-[120px]" style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.45), transparent 70%)', filter: 'blur(20px)' }} />
        <div className="relative">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-[7px]" style={{ background: 'rgba(167,139,250,0.25)', color: '#A78BFA', border: '0.5px solid rgba(167,139,250,0.4)' }}>
              <Icon name="sparkle" size={13} strokeWidth={2} />
            </div>
            <label htmlFor="ai-input" className="text-[11px] font-bold tracking-[0.06em] text-[#A78BFA] uppercase">Kaynak</label>
          </div>
          {prefs.mode === 'word' ? (
            <input
              id="ai-input"
              className="na-display w-full border-0 bg-transparent p-0 text-[22px] font-semibold tracking-[-0.02em] text-na-text outline-none placeholder:text-na-text-4"
              placeholder="serendipity"
              autoCapitalize="none"
              autoComplete="off"
              maxLength={100}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
          ) : (
            <textarea
              id="ai-input"
              className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-normal text-na-text outline-none placeholder:text-na-text-4"
              rows={4}
              maxLength={8000}
              placeholder="Bir konu yaz (ör. havaalanında kullanılan kelimeler) ya da öğrenmek istediğin bir metni yapıştır."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-na-text-3">
            <LangSelect label="Öğrenilen dil" value={prefs.src} onChange={(v) => setPrefs({ src: v, tgt: v === prefs.tgt ? prefs.src : prefs.tgt })} />
            <button type="button" aria-label="Dilleri değiştir" className="na-btn na-btn--ghost h-8 w-8 p-0" onClick={() => setPrefs({ src: prefs.tgt, tgt: prefs.src })}>
              <Icon name="arrowR" size={14} />
            </button>
            <LangSelect label="Anlam dili" value={prefs.tgt} onChange={(v) => setPrefs({ tgt: v, src: v === prefs.src ? prefs.tgt : prefs.src })} />
            <span className="ml-auto">Kelime kartı</span>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="na-glass flex flex-col gap-3 px-3.5 py-3" style={{ borderRadius: 16 }}>
        <label className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs font-semibold text-na-text-3">Deste</span>
          <select
            aria-label="Deste"
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-right text-sm font-medium text-na-text outline-none"
            value={deckUid}
            onChange={(e) => {
              setDeckUid(e.target.value)
              setPrefs({ deck: e.target.value })
            }}
          >
            {decks.length === 0 ? <option value="">Önce bir deste oluştur</option> : null}
            {decks.map((d) => <option key={d.uid} value={d.uid}>{d.name}</option>)}
          </select>
        </label>
        {prefs.mode === 'list' ? (
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-semibold text-na-text-3">Adet</span>
            <div className="flex flex-1 justify-end gap-1.5">
              {COUNTS.map((n) => (
                <button key={n} type="button" onClick={() => setPrefs({ count: n })} className="na-pill na-mono" aria-pressed={prefs.count === n}
                  style={prefs.count === n ? { background: 'color-mix(in oklab, var(--na-purple) 22%, transparent)', borderColor: 'color-mix(in oklab, var(--na-purple) 55%, transparent)', color: 'var(--na-text)', fontWeight: 700 } : undefined}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {limitReached || err?.code === 'ai_limit' ? (
        <Notice icon="clock" tone="warn">Bugünkü AI hakkın doldu. Yarın tekrar deneyebilirsin.</Notice>
      ) : (
        <Button variant="primary" className="w-full" style={{ height: 56, fontSize: 15 }} disabled={!input.trim() || thinking || !deckUid} onClick={generate}>
          <Icon name="sparkle" size={16} strokeWidth={2} /> {cards.length ? 'Yeniden üret' : 'Üret'}
        </Button>
      )}

      {thinking ? (
        <div className="na-glass flex items-center gap-3 p-4" style={{ borderRadius: 18 }} role="status">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 rounded-full" style={{ background: '#A78BFA', boxShadow: '0 0 6px #A78BFA', animation: `na-pulse 1.2s ${i * 0.15}s infinite ease-in-out` }} />
            ))}
          </div>
          <div className="text-[13px] text-na-text-2">{prefs.mode === 'word' ? 'İçerik hazırlanıyor…' : `${prefs.count} kart hazırlanıyor…`}</div>
        </div>
      ) : null}

      {err && err.code !== 'ai_limit' && !thinking ? <Notice icon="close" tone="danger">{err.message}</Notice> : null}
      {saveError ? <Notice icon="close" tone="danger">{saveError}</Notice> : null}

      {saved !== null ? (
        <div className="na-glass na-enter flex flex-col items-center gap-3 p-5 text-center" style={{ borderRadius: 20 }}>
          <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'rgba(52,211,153,0.18)', color: '#34D399' }}><Icon name="check" size={22} strokeWidth={2.5} /></div>
          <div className="text-[15px] font-semibold">{saved} kart {deck?.name ?? 'desteye'} destesine eklendi</div>
          <div className="flex w-full gap-2">
            <Button className="flex-1" onClick={reset}>{prefs.mode === 'word' ? 'Yeni kelime' : 'Yeni konu'}</Button>
            <Button variant="primary" className="flex-1" onClick={() => navigate({ to: '/decks/$uid', params: { uid: deckUid } })}>Desteye git</Button>
          </div>
        </div>
      ) : null}

      <div ref={resultRef} className="scroll-mt-4">
        {cards.length > 0 && !thinking ? (
          prefs.mode === 'word' && cards[0] ? (
            <WordResult card={cards[0]} onChange={(c) => setCards([c])} saving={!!saving} onSave={() => save([cards[0]!])} />
          ) : (
            <ListResult
              cards={cards}
              selected={selected}
              onToggle={(i) => setSelected((s) => {
                const n = new Set(s)
                if (n.has(i)) n.delete(i)
                else n.add(i)
                return n
              })}
              onAll={(on) => setSelected(on ? new Set(cards.map((_, i) => i)) : new Set())}
              saving={saving}
              onSave={() => save(cards.filter((_, i) => selected.has(i)))}
            />
          )
        ) : null}
      </div>
    </div>
  )
}

function LangSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="na-pill border-0 text-xs font-semibold text-na-text-2 outline-none">
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )
}

function Notice({ icon, tone, children }: { icon: 'clock' | 'close'; tone: 'warn' | 'danger'; children: ReactNode }) {
  const c = tone === 'warn' ? 'var(--na-warn)' : 'var(--na-danger)'
  return (
    <div role="alert" className="na-glass flex items-start gap-2.5 px-3.5 py-3 text-[13px] text-na-text-2" style={{ borderRadius: 14, borderColor: `color-mix(in oklab, ${c} 40%, transparent)` }}>
      <span style={{ color: c }} className="mt-px"><Icon name={icon} size={15} /></span>
      <span>{children}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] text-na-text-3 uppercase">
      <Icon name="sparkle" size={12} color="#A78BFA" /> {children}
    </div>
  )
}

/** One editable suggestion, the design's AIField list. */
function WordResult({ card, onChange, saving, onSave }: { card: AICard; onChange: (c: AICard) => void; saving: boolean; onSave: () => void }) {
  const f = card.fields
  const set = (p: Partial<AICard>) => onChange({ ...card, ...p })
  const setF = (p: Partial<AICard['fields']>) => onChange({ ...card, fields: { ...f, ...p } })
  return (
    <div className="na-enter flex flex-col gap-3">
      <SectionLabel>Öneri</SectionLabel>
      {card.exists ? <Notice icon="clock" tone="warn">Bu kelime destelerinden birinde zaten var.</Notice> : null}
      <AIField label="Kelime" value={card.front} onChange={(v) => set({ front: v })} display />
      <AIField label="Anlam" value={card.back} onChange={(v) => set({ back: v })} />
      <div className="grid grid-cols-2 gap-3">
        <AIField label="Telaffuz" value={f.ipa ?? ''} onChange={(v) => setF({ ipa: v })} mono />
        <AIField label="Tür" value={f.pos ?? ''} onChange={(v) => setF({ pos: v })} />
      </div>
      <AIField label="Örnek cümle" value={f.example ?? ''} onChange={(v) => setF({ example: v })} multi italic />
      <AIField label="Çevirisi" value={f.example_tr ?? ''} onChange={(v) => setF({ example_tr: v })} multi />
      <AIField label="Eş anlamlılar" value={f.synonyms ?? ''} onChange={(v) => setF({ synonyms: v })} />
      {canSpeak ? (
        <button type="button" onClick={() => speak(card.front, speechLang(f.lang))} className="na-glass flex items-center gap-2.5 px-3.5 py-3 text-left" style={{ borderRadius: 14 }}>
          <div className="flex h-7 w-7 items-center justify-center rounded-[9px]" style={{ background: 'rgba(52,211,153,0.18)', color: '#34D399' }}><Icon name="speaker" size={14} /></div>
          <div className="flex-1 text-xs text-na-text-2"><span className="font-semibold">Telaffuzu dinle</span> · cihaz sesi</div>
          <Icon name="play" size={14} color="var(--na-accent)" />
        </button>
      ) : null}
      <Button variant="primary" className="mt-1 w-full" style={{ height: 52 }} disabled={saving || !card.front.trim() || !card.back.trim()} onClick={onSave}>
        <Icon name="check" size={16} strokeWidth={2.5} /> {saving ? 'Ekleniyor…' : 'Karta dönüştür'}
      </Button>
    </div>
  )
}

function AIField({ label, value, onChange, mono, multi, italic, display }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; multi?: boolean; italic?: boolean; display?: boolean }) {
  const id = `ai-${label}`
  const cls = `w-full resize-none border-0 bg-transparent p-0 text-na-text outline-none ${mono ? 'na-mono' : ''} ${italic ? 'italic' : ''} ${display ? 'na-display text-lg font-semibold' : multi ? 'text-[13px] leading-normal' : 'text-sm font-medium'}`
  return (
    <div className="na-glass px-3.5 py-3" style={{ borderRadius: 14 }}>
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-semibold tracking-[0.08em] text-na-text-3 uppercase">{label}</label>
      {multi ? (
        <textarea id={id} rows={2} className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" />
      )}
    </div>
  )
}

function ListResult({ cards, selected, onToggle, onAll, saving, onSave }: {
  cards: AICard[]
  selected: Set<number>
  onToggle: (i: number) => void
  onAll: (on: boolean) => void
  saving: { done: number; total: number } | null
  onSave: () => void
}) {
  const n = selected.size
  const existing = useMemo(() => cards.filter((c) => c.exists).length, [cards])
  return (
    <div className="na-enter flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <SectionLabel>{cards.length} öneri · {n} seçili</SectionLabel>
        <button type="button" className="text-xs font-semibold text-na-accent" onClick={() => onAll(n < cards.length)}>
          {n < cards.length ? 'Tümünü seç' : 'Seçimi kaldır'}
        </button>
      </div>
      {existing > 0 ? <div className="text-[11px] text-na-text-3">{existing} kelime destelerinde zaten var, seçilmedi.</div> : null}
      {cards.map((c, i) => {
        const on = selected.has(i)
        return (
          <button key={`${c.front}-${i}`} type="button" onClick={() => onToggle(i)} aria-pressed={on}
            className="na-glass flex w-full items-start gap-3 px-3.5 py-3 text-left" style={{ borderRadius: 16, opacity: on ? 1 : 0.6 }}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: on ? 'var(--na-accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--na-text-4)', color: 'var(--na-on-accent, #04231A)' }}>
              {on ? <Icon name="check" size={12} strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-[15px] font-semibold">{c.front}</span>
                {c.fields.pos ? <span className="shrink-0 text-[11px] text-na-text-3">{c.fields.pos}</span> : null}
                {c.exists ? <Pill tone="warn" className="ml-auto shrink-0">zaten var</Pill> : null}
              </span>
              <span className="mt-0.5 block text-[13px] text-na-text-2">{c.back}</span>
              {c.fields.example ? <span className="mt-1 block text-xs text-na-text-3 italic">{c.fields.example}</span> : null}
            </span>
          </button>
        )
      })}
      <div className="sticky bottom-0 -mx-[18px] mt-1 px-[18px] pt-2" style={{ paddingBottom: 'max(var(--sab), 12px)', background: 'linear-gradient(180deg, transparent, var(--na-bg-0) 40%)' }}>
        <Button variant="primary" className="w-full" style={{ height: 52 }} disabled={n === 0 || !!saving} onClick={onSave}>
          <Icon name="plus" size={16} strokeWidth={2.5} /> {saving ? `Ekleniyor ${saving.done}/${saving.total}` : `Seçilenleri ekle (${n})`}
        </Button>
      </div>
    </div>
  )
}
