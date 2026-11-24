import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { activityQuery, decksQuery, meQuery, summaryQuery } from '@/api/queries'
import { Icon, type IconName } from '@/components/icons'
import { Section } from '@/components/layout/AppShell'
import { StudyCTA } from '@/components/layout/BottomTabBar'
import { Avatar, TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { CategoryDot, EmptyState, GlassCard, GlassProgress, IconBadge, RingProgress, SectionTitle, StatTile, Button } from '@/components/ui/glass'
import { tint } from '@/components/ui/categories'
import { useCategories } from '@/features/decks/useCategories'
import { deckIcon } from '@/features/decks/deckIcon'
import { compact, percent, todayLong, weekdayShort } from '@/lib/format'

export const Route = createFileRoute('/_auth/_tabs/')({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(summaryQuery)
    void queryClient.prefetchQuery(decksQuery)
    void queryClient.prefetchQuery(activityQuery(14))
  },
  component: HomeScreen,
})

function HomeScreen() {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery)
  const { data: sum } = useQuery(summaryQuery)
  const { data: decks = [] } = useQuery(decksQuery)
  const { data: days = [] } = useQuery(activityQuery(14))
  const { label } = useCategories()

  const name = me?.user.name ?? ''
  const firstName = name.split(' ')[0] ?? ''
  const due = sum?.due_now ?? 0
  const goal = sum?.daily_goal ?? 40
  const done = sum?.reviewed_today ?? 0
  const dueDecks = decks.filter((d) => d.due_count > 0)
  const maxDay = Math.max(1, ...days.map((d) => d.count))
  const week = days.slice(-7).reduce((a, d) => a + d.count, 0)

  const achievements: { name: string; icon: IconName; color: string; earned: boolean }[] = [
    { name: '7 günlük seri', icon: 'flame', color: '#FB923C', earned: (sum?.best_streak ?? 0) >= 7 },
    { name: '30 günlük seri', icon: 'bolt', color: '#FCD34D', earned: (sum?.best_streak ?? 0) >= 30 },
    { name: '100 kart öğrenildi', icon: 'book', color: '#34D399', earned: (sum?.learned_cards ?? 0) >= 100 },
    { name: 'Mükemmel hafta', icon: 'trophy', color: '#A78BFA', earned: (sum?.reviews_last_7d ?? 0) >= 50 && (sum?.recall_rate ?? 0) >= 0.95 },
  ]

  return (
    <div className="na-enter relative z-[1]">
      <TopBar
        large
        title={`Selâm, ${firstName}`}
        subtitle={`${todayLong()} · ${sum?.streak ?? 0} günlük seri`}
        leading={
          <Link to="/settings" aria-label="Ayarlar ve profil">
            <Avatar name={name} />
          </Link>
        }
        trailing={<TopBarIcon name="search" label="Ara" onClick={() => navigate({ to: '/browse' })} />}
      />

      {/* Hero ring + CTA */}
      <Section top={8}>
        <GlassCard strong glow="rgba(52,211,153,0.45)" className="p-5" radius={26}>
          <div className="relative flex items-center gap-[18px]">
            <RingProgress size={104} value={done / Math.max(1, goal)} stroke={9}>
              <div className="text-center">
                <div className="na-mono text-[26px] leading-none font-semibold">{done}</div>
                <div className="mt-[3px] text-[10px] tracking-[0.06em] text-na-text-3 uppercase">/ {goal} hedef</div>
              </div>
            </RingProgress>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-na-accent uppercase">Bugün</div>
              <div className="na-display text-[22px] leading-[1.15]">{due > 0 ? `${due} kart hazır` : 'Hepsi tamam'}</div>
              <div className="mt-1 text-xs leading-snug text-na-text-3">
                {due > 0 ? (
                  <>
                    Tahmini süre <span className="na-mono text-na-text-2">~{Math.max(1, Math.round(due * 0.25))} dk</span>.{' '}
                    {done === 0 ? 'Seriyi korumak için başla.' : 'Harika gidiyorsun.'}
                  </>
                ) : (
                  'Bugünlük tekrar yok. Yeni kart ekleyebilirsin.'
                )}
              </div>
            </div>
          </div>
          <div className="mt-[18px]">
            <StudyCTA count={due} onClick={() => navigate({ to: '/study' })} />
          </div>
        </GlassCard>
      </Section>

      {/* Micro stats */}
      <Section className="grid grid-cols-3 gap-2.5">
        <StatTile label="Seri" icon="flame" accent="#FB923C" value={<span>{sum?.streak ?? 0}<span className="ml-1 text-xs text-na-text-3">gün</span></span>} />
        <StatTile label="Hatırlama" icon="target" accent="#34D399" value={sum && sum.reviews_last_7d + sum.reviewed_today > 0 ? `${percent(sum.recall_rate)}%` : '—'} />
        <StatTile label="Toplam" icon="bolt" accent="#FCD34D" value={compact(sum?.learned_cards ?? 0)} sub="öğrenildi" />
      </Section>

      {/* Today's decks */}
      <Section top={22}>
        <SectionTitle action={<Link to="/decks" className="text-[13px] font-semibold text-na-accent no-underline">Tümü →</Link>}>Bugün gelen</SectionTitle>
        {decks.length === 0 ? (
          <EmptyState icon="layers" title="İlk desteni oluştur" action={<Link to="/decks"><Button variant="primary" icon="plus">Deste oluştur</Button></Link>}>
            Kelimeler, ayetler, görseller… Hepsi tek yerde.
          </EmptyState>
        ) : dueDecks.length === 0 ? (
          <GlassCard className="px-4 py-3.5 text-[13px] text-na-text-2" radius={18}>Bugün gelen kart yok. 🎉</GlassCard>
        ) : (
          <div className="flex flex-col gap-2">
            {dueDecks.map((d) => (
              <button
                key={d.uid}
                type="button"
                onClick={() => navigate({ to: '/study', search: { deck_uid: d.uid } })}
                className="na-glass flex w-full items-center gap-3 px-3.5 py-3 text-left"
                style={{ borderRadius: 18 }}
              >
                <IconBadge icon={deckIcon(d.icon)} color={d.color} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <CategoryDot color={d.color} size={6} />
                    <span className="text-[10px] font-semibold tracking-[0.06em] text-na-text-3 uppercase">{label(d.category)}</span>
                  </div>
                  <div className="truncate text-sm font-semibold">{d.name}</div>
                  <div className="mt-1.5">
                    <GlassProgress value={d.learned_count} max={Math.max(1, d.card_count)} color={`linear-gradient(90deg, ${d.color}, ${d.color}AA)`} height={4} />
                  </div>
                </div>
                <div className="min-w-14 text-right">
                  <div className="na-mono text-xl leading-none font-semibold" style={{ color: d.color }}>{d.due_count}</div>
                  <div className="mt-[3px] text-[10px] text-na-text-3">hazır</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Last 14 days */}
      <Section top={22}>
        <SectionTitle action={<span className="na-mono text-xs text-na-text-3">+{week}</span>}>Bu hafta</SectionTitle>
        <GlassCard className="px-3.5 py-4" radius={20}>
          <div className="flex h-[70px] items-end gap-1">
            {days.map((d, i) => {
              const today = i === days.length - 1
              return (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.count} tekrar`}
                  className="flex-1 rounded"
                  style={{
                    height: `${(d.count / maxDay) * 100}%`,
                    minHeight: 4,
                    background: today ? 'linear-gradient(180deg, var(--na-accent), color-mix(in oklab, var(--na-accent) 70%, #047857))' : 'linear-gradient(180deg, rgba(167,139,250,0.55), rgba(96,165,250,0.35))',
                    boxShadow: today ? `0 0 12px ${tint('var(--na-accent)', 50)}` : 'none',
                  }}
                />
              )
            })}
          </div>
          <div className="mt-2 flex gap-1">
            {days.map((d, i) => (
              <div key={d.day} className="flex-1 text-center text-[9px] font-semibold" style={{ color: i === days.length - 1 ? 'var(--na-accent)' : 'var(--na-text-4)' }}>
                {i === days.length - 1 ? 'Bug' : weekdayShort(d.day).slice(0, 3)}
              </div>
            ))}
          </div>
        </GlassCard>
      </Section>

      {/* Achievements */}
      <Section top={22}>
        <SectionTitle>Başarımlar</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          {achievements.map((a) => (
            <GlassCard key={a.name} className="flex flex-col items-center justify-center p-2.5 text-center" radius={18} style={{ aspectRatio: '1 / 1.05', opacity: a.earned ? 1 : 0.45 }}>
              <div
                className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  background: a.earned ? tint(a.color, 24) : 'var(--na-glass)',
                  color: a.earned ? a.color : 'var(--na-text-3)',
                  border: `0.5px solid ${a.earned ? tint(a.color, 40) : 'var(--na-glass-border)'}`,
                }}
              >
                <Icon name={a.icon} size={18} strokeWidth={a.earned ? 2 : 1.5} />
              </div>
              <div className="text-[9.5px] leading-tight font-semibold">{a.name}</div>
            </GlassCard>
          ))}
        </div>
      </Section>
    </div>
  )
}
