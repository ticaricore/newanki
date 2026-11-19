import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { cardsQuery, deckQuery, useDeleteDeck } from '@/api/queries'
import { Section } from '@/components/layout/AppShell'
import { TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, CategoryDot, EmptyState, GlassCard, GlassProgress, IconBadge, Spinner } from '@/components/ui/glass'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { categoryLabel } from '@/components/ui/categories'
import { CardRow } from '@/features/cards/CardRow'
import { DeckSheet } from '@/features/decks/DeckSheet'
import { deckIcon } from '@/features/decks/deckIcon'
import { ago } from '@/lib/format'

export const Route = createFileRoute('/_auth/_tabs/decks/$uid')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(deckQuery(params.uid)),
  component: DeckDetail,
})

function DeckDetail() {
  const { uid } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: deck } = useQuery(deckQuery(uid))
  const cards = useInfiniteQuery(cardsQuery({ deck_uid: uid }))
  const del = useDeleteDeck()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)

  if (!deck) return null
  const list = cards.data?.pages.flatMap((p) => p.cards) ?? []

  return (
    <div className="na-enter relative z-[1]">
      <TopBar
        title={deck.name}
        leading={<TopBarIcon name="chevronL" label="Geri" onClick={() => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/decks' }))} />}
        trailing={
          <>
            <TopBarIcon name="edit" label="Desteyi düzenle" onClick={() => setEditing(true)} />
            <TopBarIcon name="trash" label="Desteyi sil" onClick={() => setConfirm(true)} />
          </>
        }
      />

      <Section top={6}>
        <GlassCard strong glow={`${deck.color}66`} className="p-[18px]" radius={24}>
          <div className="relative flex items-center gap-3.5">
            <IconBadge icon={deckIcon(deck.icon, deck.category)} color={deck.color} size={52} iconSize={24} radius={16} />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <CategoryDot color={deck.color} size={6} />
                <span className="text-[10px] font-semibold tracking-[0.06em] text-na-text-3 uppercase">{categoryLabel(deck.category)}</span>
              </div>
              <div className="na-display text-[20px] leading-tight">{deck.name}</div>
              <div className="mt-1 text-[11px] text-na-text-3">son çalışma · {ago(deck.last_studied_at)}</div>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Kart', deck.card_count],
              ['Hazır', deck.due_count],
              ['Öğrenildi', deck.learned_count],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl py-2.5" style={{ background: 'var(--na-glass)' }}>
                <div className="na-mono text-[20px] leading-none font-semibold">{v}</div>
                <div className="mt-1 text-[10px] tracking-[0.06em] text-na-text-3 uppercase">{l}</div>
              </div>
            ))}
          </div>
          <div className="relative mt-3.5">
            <GlassProgress value={deck.learned_count} max={Math.max(1, deck.card_count)} color={`linear-gradient(90deg, ${deck.color}, ${deck.color}AA)`} height={5} />
          </div>
          <div className="relative mt-4 flex gap-2">
            <Button className="flex-1" icon="plus" onClick={() => navigate({ to: '/cards/new', search: { deck_uid: deck.uid } })}>Kart ekle</Button>
            <Button variant="primary" className="flex-1" disabled={deck.due_count === 0} onClick={() => navigate({ to: '/study', search: { deck_uid: deck.uid } })}>
              {deck.due_count > 0 ? `${deck.due_count} kart çalış` : 'Bugünlük bitti'}
            </Button>
          </div>
        </GlassCard>
      </Section>

      <Section top={22}>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="na-display text-[17px]">Kartlar</h2>
          <span className="na-mono text-xs text-na-text-3">{deck.card_count}</span>
        </div>
        {cards.isPending ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : list.length === 0 ? (
          <EmptyState icon="plus" title="Bu deste boş" action={<Button variant="primary" icon="plus" onClick={() => navigate({ to: '/cards/new', search: { deck_uid: deck.uid } })}>İlk kartı ekle</Button>}>
            Kelime, ses, görsel veya Kurʼan kartı ekleyerek başla.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((c) => (
              <CardRow key={c.uid} card={c} color={deck.color} onClick={() => navigate({ to: '/cards/$uid/edit', params: { uid: c.uid } })} />
            ))}
            {cards.hasNextPage ? (
              <Button className="mt-1 w-full" onClick={() => cards.fetchNextPage()} disabled={cards.isFetchingNextPage}>
                {cards.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla'}
              </Button>
            ) : null}
          </div>
        )}
      </Section>

      <DeckSheet open={editing} onOpenChange={setEditing} deck={deck} />
      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Deste silinsin mi?"
        description={`"${deck.name}" ve içindeki ${deck.card_count} kart silinecek. Çalışma geçmişi istatistiklerde kalır.`}
        confirmLabel="Desteyi sil"
        busy={del.isPending}
        onConfirm={() => del.mutate(deck.uid, { onSuccess: () => navigate({ to: '/decks' }) })}
      />
    </div>
  )
}
