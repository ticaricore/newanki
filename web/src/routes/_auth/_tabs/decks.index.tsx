import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { decksQuery } from '@/api/queries'
import type { DeckDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { Section } from '@/components/layout/AppShell'
import { TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, CategoryDot, EmptyState, GlassCard, GlassProgress, IconBadge, Pill, Spinner } from '@/components/ui/glass'
import { NA_CAT, categoryLabel, tint } from '@/components/ui/categories'
import { DeckSheet } from '@/features/decks/DeckSheet'
import { deckIcon } from '@/features/decks/deckIcon'
import { ago } from '@/lib/format'

export const Route = createFileRoute('/_auth/_tabs/decks/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(decksQuery),
  component: DecksScreen,
})

function DecksScreen() {
  const { data: decks, isPending } = useQuery(decksQuery)
  const [filter, setFilter] = useState('all')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const list = decks ?? []
  const totalDue = list.reduce((a, d) => a + d.due_count, 0)
  const cats = useMemo(() => [...new Set(list.map((d) => d.category).filter((c) => c && NA_CAT[c]))], [list])
  const filtered = filter === 'all' ? list : filter === 'due' ? list.filter((d) => d.due_count > 0) : list.filter((d) => d.category === filter)

  return (
    <div className="na-enter relative z-[1]">
      <TopBar
        large
        title="Desteler"
        subtitle={`${list.length} deste · ${totalDue} kart hazır`}
        trailing={<TopBarIcon name="plus" accent label="Yeni deste" onClick={() => setCreating(true)} />}
      />

      {list.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto px-[18px] pt-1.5 pb-1 whitespace-nowrap">
          {['all', 'due', ...cats].map((c) => {
            const active = c === filter
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                aria-pressed={active}
                className="na-glass inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-xs font-semibold"
                style={{
                  borderRadius: 999,
                  background: active ? 'var(--na-accent-soft)' : undefined,
                  borderColor: active ? 'var(--na-accent-border)' : undefined,
                  color: active ? 'var(--na-accent)' : 'var(--na-text-2)',
                }}
              >
                {NA_CAT[c] ? <CategoryDot k={c} size={6} /> : null}
                {c === 'all' ? 'Tümü' : c === 'due' ? 'Bugün gelen' : categoryLabel(c)}
              </button>
            )
          })}
        </div>
      ) : null}

      <Section top={12} className="flex flex-col gap-3">
        {isPending ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : list.length === 0 ? (
          <EmptyState icon="layers" title="Henüz desten yok" action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Deste oluştur</Button>}>
            Bir deste oluştur, içine kelime, ses, görsel veya Kurʼan kartları ekle.
          </EmptyState>
        ) : (
          filtered.map((d) => (
            <DeckCard
              key={d.uid}
              deck={d}
              onOpen={() => navigate({ to: '/decks/$uid', params: { uid: d.uid } })}
              onStudy={() => navigate({ to: '/study', search: { deck_uid: d.uid } })}
            />
          ))
        )}
      </Section>

      {list.length > 0 ? (
        <Section top={14}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 px-3.5 py-4 text-[13px] font-semibold text-na-text-2"
            style={{ borderRadius: 18, border: '1px dashed var(--na-glass-border-strong)', background: 'transparent' }}
          >
            <Icon name="plus" size={16} /> Yeni deste oluştur
          </button>
        </Section>
      ) : null}

      <DeckSheet open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function DeckCard({ deck, onOpen, onStudy }: { deck: DeckDTO; onOpen: () => void; onStudy: () => void }) {
  const pct = deck.card_count ? deck.learned_count / deck.card_count : 0
  return (
    <GlassCard className="overflow-hidden p-4" radius={22}>
      <div aria-hidden className="pointer-events-none absolute -top-5 -right-5 h-[100px] w-[100px]" style={{ background: `radial-gradient(circle, ${tint(deck.color, 35)}, transparent 70%)`, filter: 'blur(20px)' }} />
      <button type="button" onClick={onOpen} className="relative flex w-full items-start gap-3 border-0 bg-transparent p-0 text-left">
        <IconBadge icon={deckIcon(deck.icon, deck.category)} color={deck.color} size={44} iconSize={20} radius={14} />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <CategoryDot color={deck.color} size={6} />
            <span className="text-[10px] font-semibold tracking-[0.06em] text-na-text-3 uppercase">{categoryLabel(deck.category)}</span>
          </div>
          <div className="mb-0.5 text-base leading-tight font-semibold tracking-[-0.01em]">{deck.name}</div>
          <div className="text-[11px] text-na-text-3">son çalışma · {ago(deck.last_studied_at)}</div>
        </div>
        {deck.due_count > 0 ? (
          <Pill tone="accent" className="shrink-0"><span className="na-mono">{deck.due_count}</span> hazır</Pill>
        ) : deck.card_count > 0 ? (
          <Pill className="shrink-0" style={{ color: 'var(--na-text-3)' }}>Tamamlandı</Pill>
        ) : (
          <Pill className="shrink-0" style={{ color: 'var(--na-text-3)' }}>Boş</Pill>
        )}
      </button>

      <div className="relative mt-3.5">
        <div className="mb-[5px] flex justify-between text-[10px] font-semibold tracking-[0.04em] text-na-text-3 uppercase">
          <span>İlerleme</span>
          <span className="na-mono text-na-text-2">{deck.learned_count} / {deck.card_count} · {Math.round(pct * 100)}%</span>
        </div>
        <GlassProgress value={deck.learned_count} max={Math.max(1, deck.card_count)} color={`linear-gradient(90deg, ${deck.color}, ${deck.color}AA)`} height={5} />
      </div>

      <div className="relative mt-3.5 flex gap-2">
        <Button size="sm" className="flex-1" style={{ height: 40 }} onClick={onOpen}>İncele</Button>
        <Button size="sm" variant="primary" className="flex-1" style={{ height: 40 }} onClick={onStudy} disabled={deck.due_count === 0}>
          {deck.due_count > 0 ? `${deck.due_count} kart çalış` : 'Bugünlük bitti'}
        </Button>
      </div>
    </GlassCard>
  )
}
