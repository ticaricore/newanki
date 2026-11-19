import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { activityQuery, decksQuery, distributionQuery, heatmapQuery, summaryQuery } from '@/api/queries'
import { Icon } from '@/components/icons'
import { Section } from '@/components/layout/AppShell'
import { TopBar } from '@/components/layout/TopBar'
import { CategoryDot, GlassCard, GlassProgress, GlassSegment, Heatmap } from '@/components/ui/glass'
import { num, percent } from '@/lib/format'

export const Route = createFileRoute('/_auth/_tabs/stats')({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(summaryQuery)
    void queryClient.prefetchQuery(heatmapQuery('6m'))
    void queryClient.prefetchQuery(distributionQuery)
  },
  component: StatsScreen,
})

function StatsScreen() {
  const [range, setRange] = useState<'6m' | '1y'>('6m')
  const { data: sum } = useQuery(summaryQuery)
  const { data: heat = [] } = useQuery(heatmapQuery(range))
  const { data: dist = [] } = useQuery(distributionQuery)
  const { data: decks = [] } = useQuery(decksQuery)
  const { data: month = [] } = useQuery(activityQuery(28))

  const heatMax = Math.max(1, ...heat.map((d) => d.count))
  const heatTotal = heat.reduce((a, d) => a + d.count, 0)
  const distMax = Math.max(1, ...dist.map((d) => d.count))
  const thisWeek = month.slice(-7).reduce((a, d) => a + d.count, 0)
  const lastWeek = month.slice(-14, -7).reduce((a, d) => a + d.count, 0)
  const weak = dist.slice(0, 3).reduce((a, d) => a + d.count, 0)

  return (
    <div className="na-enter relative z-[1]">
      <TopBar large title="İlerleme" subtitle={`${sum?.streak ?? 0} günlük seri · son ${range === '6m' ? '6 ay' : '1 yıl'}`} />

      <Section top={4} className="grid grid-cols-2 gap-2.5">
        <HeroStat label="Seri" value={sum?.streak ?? 0} unit="gün" color="#FB923C" icon="flame" note={`kişisel rekor ${sum?.best_streak ?? 0}g`} />
        <HeroStat label="Hatırlama" value={sum ? percent(sum.recall_rate) : 0} unit="%" color="#34D399" icon="target" note="son 30 gün" />
      </Section>

      <Section>
        <GlassCard className="p-4" radius={22}>
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <div>
              <div className="na-display text-base">Çalışma yoğunluğu</div>
              <div className="mt-0.5 text-[11px] text-na-text-3">Son {range === '6m' ? '6 ay' : '1 yıl'} · {num(heatTotal)} tekrar</div>
            </div>
            <GlassSegment<'6m' | '1y'> ariaLabel="Aralık" options={[{ value: '6m', label: '6A' }, { value: '1y', label: 'Yıl' }]} value={range} onChange={setRange} />
          </div>
          <div className="overflow-x-auto pb-1" dir="rtl">
            <div dir="ltr">
              <Heatmap data={heat.map((d) => (d.count ? Math.max(0.15, d.count / heatMax) : 0))} titles={heat.map((d) => `${d.day}: ${d.count}`)} size={range === '6m' ? 11 : 9} gap={range === '6m' ? 4 : 3} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-na-text-3">Az</span>
            <div className="flex gap-[3px]">
              {[0.15, 0.3, 0.5, 0.7, 0.95].map((v) => (
                <div key={v} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: `color-mix(in oklab, var(--na-accent) ${Math.round(20 + v * 80)}%, transparent)` }} />
              ))}
            </div>
            <span className="text-[10px] text-na-text-3">Çok</span>
          </div>
        </GlassCard>
      </Section>

      <Section>
        <GlassCard className="p-4" radius={22}>
          <div className="na-display mb-1 text-base">SRS dağılımı</div>
          <div className="mb-3.5 text-[11px] text-na-text-3">Bilgi aşamasına göre kart sayısı</div>
          <div className="flex h-[100px] items-end gap-1">
            {dist.map((d, i) => {
              const color = i < 3 ? '#FB7185' : i < 6 ? '#FCD34D' : '#34D399'
              return (
                <div key={d.level} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="na-mono text-[9px] text-na-text-3">{d.count}</div>
                  <div className="w-full rounded-[5px]" style={{ height: `${(d.count / distMax) * 80}%`, minHeight: 4, background: `linear-gradient(180deg, ${color}, color-mix(in oklab, ${color} 60%, transparent))`, boxShadow: `0 0 10px color-mix(in oklab, ${color} 45%, transparent)` }} />
                </div>
              )
            })}
          </div>
          <div className="mt-1.5 flex gap-1">
            {dist.map((d) => (
              <div key={d.level} className="na-mono flex-1 text-center text-[9px] text-na-text-4">{d.interval_days}g</div>
            ))}
          </div>
        </GlassCard>
      </Section>

      {decks.length > 0 ? (
        <Section>
          <GlassCard className="p-4" radius={22}>
            <div className="na-display mb-3 text-base">Deste bazında</div>
            <div className="flex flex-col gap-3">
              {decks.map((d) => {
                const pct = d.card_count ? d.learned_count / d.card_count : 0
                return (
                  <div key={d.uid}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                        <CategoryDot color={d.color} size={6} />
                        <span className="truncate">{d.name.split(' — ')[0]}</span>
                      </span>
                      <span className="na-mono text-[11px] text-na-text-3">{Math.round(pct * 100)}%</span>
                    </div>
                    <GlassProgress value={d.learned_count} max={Math.max(1, d.card_count)} color={`linear-gradient(90deg, ${d.color}, ${d.color}AA)`} height={4} />
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </Section>
      ) : null}

      <Section>
        <GlassCard strong glow="rgba(167,139,250,0.40)" className="p-4" radius={22}>
          <div className="relative flex items-start gap-3">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(167,139,250,0.22)', color: '#A78BFA', border: '0.5px solid rgba(167,139,250,0.4)' }}>
              <Icon name="sparkle" size={18} strokeWidth={2} />
            </div>
            <div>
              <div className="na-display text-sm">Bu hafta için içgörü</div>
              <div className="mt-1 text-xs leading-normal text-na-text-2">
                Bu hafta <span className="na-mono text-na-text">{thisWeek}</span> tekrar yaptın
                {lastWeek > 0 ? (
                  <>; geçen haftaya göre <span className="na-mono" style={{ color: thisWeek >= lastWeek ? '#34D399' : '#FB7185' }}>{thisWeek >= lastWeek ? '+' : ''}{Math.round(((thisWeek - lastWeek) / lastWeek) * 100)}%</span></>
                ) : null}
                .{' '}
                {weak > 0 ? <>İlk üç seviyede <span className="na-mono" style={{ color: '#FB7185' }}>{weak}</span> kart var; bunlar en sık tekrar gerektirenler.</> : 'Kartlarının çoğu kalıcı hafızada. 👏'}
              </div>
            </div>
          </div>
        </GlassCard>
      </Section>
    </div>
  )
}

function HeroStat({ label, value, unit, color, icon, note }: { label: string; value: number; unit: string; color: string; icon: 'flame' | 'target'; note: string }) {
  return (
    <GlassCard strong glow={`${color}66`} className="p-4" radius={22}>
      <div className="relative">
        <div className="text-[11px] font-semibold tracking-[0.06em] text-na-text-3 uppercase">{label}</div>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="na-mono text-[40px] leading-none font-semibold tracking-[-0.03em]" style={{ color }}>{value}</span>
          <span className="text-[13px] text-na-text-2">{unit}</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-na-text-3">
          <Icon name={icon} size={12} color={color} /> <span>{note}</span>
        </div>
      </div>
    </GlassCard>
  )
}
