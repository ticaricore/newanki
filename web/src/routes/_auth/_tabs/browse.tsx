import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { cardsQuery, decksQuery } from '@/api/queries'
import { Icon } from '@/components/icons'
import { Section } from '@/components/layout/AppShell'
import { TopBar } from '@/components/layout/TopBar'
import { Button, EmptyState, GlassSegment, Spinner } from '@/components/ui/glass'
import { CardRow } from '@/features/cards/CardRow'

type TypeFilter = 'all' | 'word' | 'audio' | 'image' | 'quran'

export const Route = createFileRoute('/_auth/_tabs/browse')({
  validateSearch: (s: Record<string, unknown>): { q?: string; type?: TypeFilter } => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    type: ['word', 'audio', 'image', 'quran'].includes(s.type as string) ? (s.type as TypeFilter) : undefined,
  }),
  component: BrowseScreen,
})

const RECENT_KEY = 'na:recent-searches'

function useRecent() {
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const push = (q: string) => {
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, 8)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }
  const clear = () => {
    setRecent([])
    localStorage.removeItem(RECENT_KEY)
  }
  return { recent, push, clear }
}

function BrowseScreen() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [input, setInput] = useState(search.q ?? '')
  const type = search.type ?? 'all'
  const q = search.q ?? ''
  const { recent, push, clear } = useRecent()
  const { data: decks = [] } = useQuery(decksQuery)
  const colors = useMemo(() => new Map(decks.map((d) => [d.uid, d.color])), [decks])

  // Debounce typing into the URL (?q=) so results are shareable and back-navigable.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = input.trim()
      if (v !== q) void navigate({ search: (s) => ({ ...s, q: v || undefined }), replace: true })
    }, 250)
    return () => window.clearTimeout(t)
  }, [input, q, navigate])

  const results = useInfiniteQuery({ ...cardsQuery({ q: q || undefined, type: type === 'all' ? undefined : type }), placeholderData: (prev) => prev })
  const list = results.data?.pages.flatMap((p) => p.cards) ?? []

  return (
    <div className="na-enter relative z-[1]">
      <TopBar large title="Ara" subtitle={q ? `"${q}" için sonuçlar` : 'Tüm kartlar'} />

      <Section top={4}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim()) push(input.trim())
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}
          className="na-glass na-glass--strong flex items-center gap-2.5 py-1 pr-1 pl-3.5"
          style={{ borderRadius: 18 }}
        >
          <Icon name="search" size={16} color="var(--na-text-3)" />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Kartlarda ara"
            placeholder="serendipity, mitokondri, bakara…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-base text-na-text outline-none placeholder:text-na-text-4"
          />
          {input ? (
            <button type="button" aria-label="Temizle" onClick={() => setInput('')} className="flex h-10 w-10 items-center justify-center border-0 bg-transparent text-na-text-3">
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </form>
      </Section>

      <Section top={12}>
        <GlassSegment<TypeFilter>
          full
          ariaLabel="Kart tipi"
          value={type}
          onChange={(v) => navigate({ search: (s) => ({ ...s, type: v === 'all' ? undefined : v }), replace: true })}
          options={[
            { value: 'all', label: 'Tümü' },
            { value: 'word', label: 'Kelime' },
            { value: 'audio', label: 'Ses' },
            { value: 'image', label: 'Görsel' },
            { value: 'quran', label: 'Kurʼan' },
          ]}
        />
      </Section>

      {!q && recent.length > 0 ? (
        <Section top={20}>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="na-label">Son aramalar</span>
            <button type="button" onClick={clear} className="border-0 bg-transparent text-[11px] text-na-text-3">Temizle</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((t) => (
              <button key={t} type="button" onClick={() => setInput(t)} className="na-glass inline-flex items-center gap-1.5 px-3 py-2 text-xs text-na-text-2" style={{ borderRadius: 999 }}>
                <Icon name="clock" size={12} /> {t}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section top={20}>
        <div className="na-label mb-2.5 flex justify-between">
          <span>Sonuçlar</span>
          <span className="na-mono text-na-text-2">{list.length}{results.hasNextPage ? '+' : ''}</span>
        </div>
        {results.isPending ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : list.length === 0 ? (
          <EmptyState icon="search" title={q ? 'Sonuç yok' : 'Henüz kart yok'}>
            {q ? 'Farklı bir kelime deneyin. Arama aksanlara duyarsızdır.' : 'Bir desteye kart eklediğinizde burada görünür.'}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((c) => (
              <CardRow key={c.uid} card={c} color={colors.get(c.deck_uid)} onClick={() => { if (q) push(q); void navigate({ to: '/cards/$uid/edit', params: { uid: c.uid } }) }} />
            ))}
            {results.hasNextPage ? (
              <Button className="mt-1 w-full" onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
                {results.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla'}
              </Button>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  )
}
