import { Children, Fragment, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { meQuery, settingsQuery, useLogout, usePatchSettings } from '@/api/queries'
import type { SettingsPatch } from '@/api/types.gen'
import { Icon, type IconName } from '@/components/icons'
import { Section } from '@/components/layout/AppShell'
import { Avatar, TopBar } from '@/components/layout/TopBar'
import { Button, GlassCard, GlassSegment, Pill } from '@/components/ui/glass'
import { tint } from '@/components/ui/categories'
import { Sheet } from '@/components/ui/Sheet'
import { ago } from '@/lib/format'
import { flush, offlineInfo, prepareOffline, useSyncState } from '@/offline/sync'
import { useTheme } from '@/theme/ThemeProvider'
import { ACCENT_OPTIONS, type Density, type FlipStyle, type FontName, type ThemeName, type VisualDirection } from '@/theme/theme'

export const Route = createFileRoute('/_auth/_tabs/settings')({
  component: SettingsScreen,
})

const TIMEZONES = ['Europe/Istanbul', 'Europe/Berlin', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'Asia/Dubai', 'Asia/Riyadh', 'UTC']

function SettingsScreen() {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery)
  const { data: s } = useQuery(settingsQuery)
  const patch = usePatchSettings()
  const logout = useLogout()
  const { setPrefs } = useTheme()
  const [goalSheet, setGoalSheet] = useState(false)
  const [tzSheet, setTzSheet] = useState(false)
  const [goal, setGoal] = useState(40)

  if (!me || !s) return null
  const user = me.user
  const update = (p: SettingsPatch) => patch.mutate(p)
  const appearance = (p: Partial<{ theme: ThemeName; accent: string; density: Density; font: FontName; vd: VisualDirection }>) => {
    setPrefs(p) // instant preview
    update(p)
  }
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zones = [...new Set([browserTz, ...TIMEZONES])]

  return (
    <div className="na-enter relative z-[1]">
      <TopBar large title="Ayarlar" />

      <Section top={4}>
        <GlassCard strong className="flex items-center gap-3.5 p-[18px]" radius={22}>
          <Avatar name={user.name} size={56} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{user.name}</div>
            <div className="mt-0.5 truncate text-xs text-na-text-3">{user.email}</div>
          </div>
          {user.role === 'admin' ? <Pill tone="purple" icon="shield">Admin</Pill> : null}
        </GlassCard>
      </Section>

      <SettingSection title="Çalışma">
        <SettingRow icon="target" color="#34D399" label="Günlük hedef" detail={`${s.daily_goal} kart`} onClick={() => { setGoal(s.daily_goal); setGoalSheet(true) }} />
        <SettingRow icon="clock" color="#A78BFA" label="Gün başlangıcı" detail={
          <select aria-label="Gün başlangıcı" value={s.day_starts_at_hour} onChange={(e) => update({ day_starts_at_hour: Number(e.target.value) })} className="border-0 bg-transparent text-right text-xs text-na-text-3 outline-none">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        } />
        <SettingRow icon="globe" color="#60A5FA" label="Saat dilimi" detail={s.timezone.replace('_', ' ')} onClick={() => setTzSheet(true)} />
      </SettingSection>

      <SettingSection title="SRS algoritması">
        <SettingRow icon="brain" color="#34D399" label="Aralıklar" detail={<span className="na-mono">{s.srs_intervals.join(', ')}</span>} />
        <SettingRow icon="refresh" color="#FB7185" label="Yanlış cevap" detail="Bir alt seviyeye" />
      </SettingSection>

      <Section top={20}>
        <div className="na-label mb-2 pl-1">Görünüm</div>
        <GlassCard className="flex flex-col gap-4 p-4" radius={18}>
          <Control label="Tema">
            <GlassSegment<ThemeName> full ariaLabel="Tema" value={s.theme as ThemeName} onChange={(v) => appearance({ theme: v })}
              options={[{ value: 'system', label: 'Sistem' }, { value: 'dark', label: 'Dark' }, { value: 'oled', label: 'OLED' }, { value: 'light', label: 'Light' }]} />
          </Control>
          <Control label="Vurgu rengi">
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_OPTIONS.map((c) => (
                <button key={c} type="button" aria-label={`Vurgu ${c}`} aria-pressed={s.accent.toUpperCase() === c} onClick={() => appearance({ accent: c })}
                  className="h-9 w-9 rounded-full border-0" style={{ background: c, boxShadow: s.accent.toUpperCase() === c ? `0 0 0 2px var(--na-bg-0), 0 0 0 4px ${c}` : 'none' }} />
              ))}
            </div>
          </Control>
          <Control label="Görsel yön">
            <GlassSegment<VisualDirection> full ariaLabel="Görsel yön" value={s.vd as VisualDirection} onChange={(v) => appearance({ vd: v })}
              options={[{ value: 'minimal', label: 'Minimal' }, { value: 'glass', label: 'Glass' }, { value: 'character', label: 'Karakter' }]} />
          </Control>
          <Control label="Yazı tipi">
            <GlassSegment<FontName> full ariaLabel="Yazı tipi" value={s.font as FontName} onChange={(v) => appearance({ font: v })}
              options={[{ value: 'geist', label: 'Geist' }, { value: 'inter', label: 'Inter' }, { value: 'sfpro', label: 'Sistem' }, { value: 'serif', label: 'Serif' }]} />
          </Control>
          <Control label="Yoğunluk">
            <GlassSegment<Density> full ariaLabel="Yoğunluk" value={s.density as Density} onChange={(v) => appearance({ density: v })}
              options={[{ value: 'compact', label: 'Kompakt' }, { value: 'balanced', label: 'Denge' }, { value: 'spacious', label: 'Ferah' }]} />
          </Control>
          <Control label="Kart açma animasyonu">
            <GlassSegment<FlipStyle> full ariaLabel="Kart animasyonu" value={s.flip_style as FlipStyle} onChange={(v) => update({ flip_style: v })}
              options={[{ value: 'flip', label: 'Flip' }, { value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }]} />
          </Control>
        </GlassCard>
      </Section>

      <OfflineSection userUid={user.uid} />

      <SettingSection title="Veri">
        <SettingRow icon="download" color="#34D399" label="Verilerimi indir" detail="SQLite" href="/api/v1/export/sqlite" />
      </SettingSection>

      <SettingSection title="Hesap">
        <SettingRow icon="key" color="#FCD34D" label="Şifreyi değiştir" onClick={() => navigate({ to: '/change-password' })} />
        {user.role === 'admin' ? <SettingRow icon="shield" color="#A78BFA" label="Yönetim paneli" detail="Kullanıcılar · ayarlar" onClick={() => navigate({ to: '/admin' })} /> : null}
        <SettingRow icon="logout" color="#FB7185" label="Çıkış yap" danger onClick={() => logout.mutate(undefined, { onSettled: () => navigate({ to: '/login' }) })} />
      </SettingSection>

      <div className="na-mono px-[18px] py-4 text-center text-[11px] text-na-text-4">NewAnki · 1.0.0 · Made with care</div>

      <Sheet open={goalSheet} onOpenChange={setGoalSheet} title="Günlük hedef" description="Her güne kaç tekrar ayıracaksın?">
        <div className="pb-2 text-center">
          <div className="na-mono text-[64px] leading-none font-semibold tracking-[-0.04em] text-na-accent">{goal}</div>
          <div className="mt-1 text-xs text-na-text-3">kart · ~{Math.round(goal * 0.45)} dk</div>
          <input type="range" min={10} max={120} step={5} value={goal} onChange={(e) => setGoal(Number(e.target.value))} aria-label="Günlük hedef" className="mt-5 w-full" style={{ accentColor: 'var(--na-accent)' }} />
          <div className="na-mono mt-1 flex justify-between text-[10px] text-na-text-3"><span>10 · sakin</span><span>40 · standart</span><span>120 · yoğun</span></div>
          <Button variant="primary" size="lg" className="mt-5 w-full" onClick={() => { update({ daily_goal: goal }); setGoalSheet(false) }}>Kaydet</Button>
        </div>
      </Sheet>

      <Sheet open={tzSheet} onOpenChange={setTzSheet} title="Saat dilimi" description="Gün dönümü ve seri hesabı bu saat dilimine göre yapılır.">
        <div className="flex flex-col gap-2 pb-2">
          {zones.map((z) => (
            <button key={z} type="button" onClick={() => { update({ timezone: z }); setTzSheet(false) }} className="na-glass flex items-center justify-between px-3.5 py-3 text-left text-sm" style={{ borderRadius: 14 }}>
              <span>{z.replace('_', ' ')}{z === browserTz ? <span className="ml-2 text-[11px] text-na-text-3">bu cihaz</span> : null}</span>
              {z === s.timezone ? <Icon name="check" size={16} color="var(--na-accent)" /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="na-label mb-2">{label}</div>
      {children}
    </div>
  )
}

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  const items = Children.toArray(children)
  return (
    <Section top={20}>
      <div className="na-label mb-2 pl-1">{title}</div>
      <GlassCard className="overflow-hidden" radius={18}>
        {items.map((c, i) => (
          <Fragment key={i}>
            {i > 0 ? <div className="ml-[52px] h-px" style={{ background: 'var(--na-glass-border)', height: 0.5 }} /> : null}
            {c}
          </Fragment>
        ))}
      </GlassCard>
    </Section>
  )
}

/** Sync status, manual sync and the copy of upcoming cards kept for offline study. */
function OfflineSection({ userUid }: { userUid: string }) {
  const sync = useSyncState()
  const [busy, setBusy] = useState(false)
  const info = useQuery({ queryKey: ['offline-info', userUid, sync.lastSyncAt], queryFn: () => offlineInfo(userUid), networkMode: 'always' })
  const status = !sync.online ? 'Çevrimdışı' : sync.syncing ? 'Gönderiliyor…' : sync.pending > 0 ? `${sync.pending} cevap bekliyor` : 'Güncel'
  const download = async () => {
    setBusy(true)
    try {
      await prepareOffline(userUid, true)
      await info.refetch()
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingSection title="Çevrimdışı">
      <SettingRow
        icon={sync.online ? 'cloudCheck' : 'wifiOff'}
        color={sync.online ? '#34D399' : '#FCD34D'}
        label="Senkron"
        detail={sync.lastSyncAt ? `${status} · ${ago(sync.lastSyncAt)}` : status}
        onClick={sync.pending > 0 && sync.online ? () => void flush() : undefined}
      />
      <SettingRow
        icon="download"
        color="#60A5FA"
        label="Cihazdaki kartlar"
        detail={busy ? 'İndiriliyor…' : info.data ? `${info.data.cards} kart · ${ago(info.data.fetchedAt)}` : 'İndirilmedi'}
        onClick={sync.online && !busy ? () => void download() : undefined}
      />
    </SettingSection>
  )
}

function SettingRow({ icon, color, label, detail, danger, onClick, href }: { icon: IconName; color: string; label: string; detail?: ReactNode; danger?: boolean; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(color, 18), color }}>
        <Icon name={icon} size={15} />
      </div>
      <div className="flex-1 text-sm font-medium" style={{ color: danger ? 'var(--na-danger)' : 'var(--na-text)' }}>{label}</div>
      {detail ? <div className="max-w-[55%] truncate text-right text-xs text-na-text-3">{detail}</div> : null}
      {onClick || href ? <Icon name="chevronR" size={14} color="var(--na-text-4)" /> : null}
    </>
  )
  const cls = 'flex min-h-[52px] w-full items-center gap-3 border-0 bg-transparent px-3.5 py-3 text-left no-underline'
  if (href) return <a href={href} download className={cls}>{inner}</a>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>
  return <div className={cls}>{inner}</div>
}
