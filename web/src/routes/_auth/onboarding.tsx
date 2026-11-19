import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { settingsQuery, usePatchSettings } from '@/api/queries'
import { Icon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { Button, GlassCard, IconBadge } from '@/components/ui/glass'
import { CARD_TYPES, type CardType } from '@/components/ui/categories'
import { Logo } from '@/components/ui/Logo'

export const Route = createFileRoute('/_auth/onboarding')({
  component: Onboarding,
})

const TOTAL = 4

function Onboarding() {
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState(40)
  const { data: s } = useQuery(settingsQuery)
  const patch = usePatchSettings()
  const navigate = useNavigate()
  const intervals = s?.srs_intervals ?? [0, 1, 2, 3, 7, 30, 60, 90, 180, 360]

  const finish = (withGoal: boolean) =>
    patch.mutate(
      { onboarded: true, ...(withGoal ? { daily_goal: goal, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}) },
      { onSuccess: () => navigate({ to: '/' }) },
    )

  return (
    <AppShell>
      <div className="flex flex-col px-[22px]" style={{ minHeight: '100dvh', paddingTop: 'calc(max(var(--sat), 10px) + 26px)', paddingBottom: 'max(var(--sab), 24px)' }}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Adım ${step + 1} / ${TOTAL}`}>
            {Array.from({ length: TOTAL }, (_, i) => (
              <div key={i} className="h-1.5 rounded-full" style={{ width: i === step ? 22 : 6, background: i === step ? 'var(--na-accent)' : 'var(--na-glass-border-strong)', boxShadow: i === step ? '0 0 8px var(--na-accent)' : 'none', transition: 'width 240ms var(--ease-soft)' }} />
            ))}
          </div>
          <button type="button" onClick={() => finish(false)} className="border-0 bg-transparent text-[13px] font-medium text-na-text-3">Atla</button>
        </div>

        <div key={step} className="na-enter flex flex-1 flex-col justify-center">
          {step === 0 && (
            <div className="text-center">
              <div className="mb-8"><Logo size={110} /></div>
              <h1 className="na-display text-[36px] leading-[1.05] tracking-[-0.035em]">NewAnki'ye<br />hoş geldin.</h1>
              <p className="mt-3.5 px-3 text-sm leading-normal text-na-text-2">Bilmek istediğin her şeyi sabit aralıklarla tekrarla. Sade ve premium bir hatırlama deneyimi.</p>
            </div>
          )}
          {step === 1 && (
            <div>
              <Eyebrow>Aralıklı tekrar</Eyebrow>
              <Title>{intervals.length} sabit aralık<br />{intervals[0]}g'den {intervals[intervals.length - 1]}g'ye.</Title>
              <GlassCard strong className="p-3.5" radius={20}>
                <div className="flex h-[70px] items-end gap-1.5">
                  {intervals.map((g, i) => (
                    <div key={i} className="flex-1 rounded" style={{ height: `${Math.max(0.08, Math.log(g + 1.4) / Math.log((intervals.at(-1) ?? 360) + 1)) * 100}%`, minHeight: 6, background: `linear-gradient(180deg, color-mix(in oklab, var(--na-accent) ${30 + i * 7}%, transparent), color-mix(in oklab, var(--na-accent) ${10 + i * 5}%, transparent))`, border: '0.5px solid var(--na-accent-border)' }} />
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  {intervals.map((g, i) => <div key={i} className="na-mono flex-1 text-center text-[9px] text-na-text-3">{g}g</div>)}
                </div>
              </GlassCard>
              <p className="mt-[18px] px-1 text-center text-[13px] leading-normal text-na-text-2">Doğru cevapla bir üst aralığa geç. Yanlış cevapla bir alt aralığa düş. Hepsi bu.</p>
            </div>
          )}
          {step === 2 && (
            <div>
              <Eyebrow>Dört kart tipi</Eyebrow>
              <Title>Her tür içerik<br />hepsi tek yerde.</Title>
              <div className="grid grid-cols-2 gap-2.5">
                {(Object.keys(CARD_TYPES) as CardType[]).map((k) => {
                  const t = CARD_TYPES[k]
                  return (
                    <GlassCard key={k} className="p-4 text-center" radius={18}>
                      <div className="mb-2.5 flex justify-center"><IconBadge icon={t.icon} color={t.color} size={42} iconSize={20} radius={13} /></div>
                      <div className="text-sm font-semibold">{t.label}</div>
                      <div className="mt-[3px] text-[11px] leading-tight text-na-text-3">{t.desc}</div>
                    </GlassCard>
                  )
                })}
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <Eyebrow>Günlük hedef</Eyebrow>
              <Title>Her güne kaç<br />kart ayıracaksın?</Title>
              <div className="mb-4 text-center">
                <div className="na-mono text-[72px] leading-none font-semibold tracking-[-0.04em] text-na-accent" style={{ textShadow: '0 0 30px color-mix(in oklab, var(--na-accent) 50%, transparent)' }}>{goal}</div>
                <div className="mt-1 text-xs text-na-text-3">kart · ~{Math.round(goal * 0.45)} dk</div>
              </div>
              <GlassCard className="p-4" radius={18}>
                <input type="range" min={10} max={120} step={5} value={goal} onChange={(e) => setGoal(Number(e.target.value))} aria-label="Günlük hedef" className="w-full" style={{ accentColor: 'var(--na-accent)' }} />
                <div className="na-mono mt-1 flex justify-between text-[10px] text-na-text-3"><span>10 · sakin</span><span>40 · standart</span><span>120 · yoğun</span></div>
              </GlassCard>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-2.5">
          {step > 0 ? (
            <Button aria-label="Geri" onClick={() => setStep((s) => s - 1)} style={{ height: 56, width: 56, padding: 0 }}>
              <Icon name="arrowL" size={18} />
            </Button>
          ) : null}
          <Button variant="primary" className="flex-1" style={{ height: 56, fontSize: 15 }} disabled={patch.isPending} onClick={() => (step === TOTAL - 1 ? finish(true) : setStep((s) => s + 1))}>
            {step === TOTAL - 1 ? 'Başla' : 'Devam'}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-4 text-center text-[11px] font-semibold tracking-[0.08em] text-na-accent uppercase">{children}</div>
)
const Title = ({ children }: { children: React.ReactNode }) => (
  <div className="na-display mb-[26px] text-center text-[28px] leading-[1.15] tracking-[-0.025em]">{children}</div>
)
