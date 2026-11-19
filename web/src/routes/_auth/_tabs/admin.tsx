import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import {
  adminSettingsQuery, adminStatsQuery, adminUsersQuery, meQuery, useAdminCreateUser, useAdminDeleteUser,
  useAdminPatchUser, useAdminPutSettings,
} from '@/api/queries'
import type { AdminUserDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { Section } from '@/components/layout/AppShell'
import { Avatar, TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, GlassCard, GlassSegment, Pill, Spinner, StatTile } from '@/components/ui/glass'
import { FormError, PasswordInput, TextInput } from '@/components/ui/form'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Sheet } from '@/components/ui/Sheet'
import { ago, bytes } from '@/lib/format'

export const Route = createFileRoute('/_auth/_tabs/admin')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me.user.role !== 'admin') throw redirect({ to: '/' })
  },
  component: AdminScreen,
})

function AdminScreen() {
  const router = useRouter()
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery)
  const { data: users, isPending } = useQuery(adminUsersQuery)
  const { data: stats } = useQuery(adminStatsQuery)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<AdminUserDTO | null>(null)

  return (
    <div className="na-enter relative z-[1]">
      <TopBar
        title="Yönetim"
        leading={<TopBarIcon name="chevronL" label="Geri" onClick={() => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/settings' }))} />}
        trailing={<TopBarIcon name="plus" accent label="Kullanıcı ekle" onClick={() => setCreating(true)} />}
      />

      <Section top={4} className="grid grid-cols-3 gap-2.5">
        <StatTile label="Kullanıcı" value={stats?.users ?? '—'} icon="user" accent="#60A5FA" />
        <StatTile label="Aktif" value={stats?.active_users ?? '—'} icon="check" accent="#34D399" />
        <StatTile label="Veri" value={stats ? bytes(stats.total_db_bytes) : '—'} icon="layers" accent="#A78BFA" />
      </Section>

      <Section top={22}>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="na-display text-[17px]">Kullanıcılar</h2>
          <Button size="sm" icon="plus" onClick={() => setCreating(true)}>Ekle</Button>
        </div>
        {isPending ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-2">
            {users?.map((u) => (
              <button key={u.uid} type="button" onClick={() => setSelected(u)} className="na-glass flex w-full items-center gap-3 px-3.5 py-3 text-left" style={{ borderRadius: 16, opacity: u.status === 'disabled' ? 0.55 : 1 }}>
                <Avatar name={u.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {u.name}
                    {u.uid === me?.user.uid ? <span className="text-[11px] font-normal text-na-text-3">(sen)</span> : null}
                  </div>
                  <div className="truncate text-xs text-na-text-3">{u.email}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {u.role === 'admin' ? <Pill tone="purple">Admin</Pill> : null}
                  {u.status === 'disabled' ? <Pill tone="danger">Devre dışı</Pill> : u.must_change_password ? <Pill tone="warn">Şifre bekliyor</Pill> : null}
                  <span className="na-mono text-[10px] text-na-text-4">{bytes(u.db_bytes)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      <GlobalSettings />

      <CreateUserSheet open={creating} onOpenChange={setCreating} />
      <UserSheet user={selected} self={selected?.uid === me?.user.uid} onClose={() => setSelected(null)} />
    </div>
  )
}

function CreateUserSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useAdminCreateUser()
  const [v, setV] = useState({ email: '', name: '', password: '', role: 'user' as 'user' | 'admin' })
  useEffect(() => {
    if (open) {
      setV({ email: '', name: '', password: '', role: 'user' })
      create.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const err = create.error instanceof ApiError ? create.error : null
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Kullanıcı ekle" description="Kullanıcı ilk girişte şifresini değiştirmek zorunda kalır.">
      <form className="flex flex-col gap-4 pb-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ ...v, must_change_password: true }, { onSuccess: () => onOpenChange(false) }) }}>
        <TextInput label="Ad soyad" name="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={err?.fields.name} autoComplete="off" />
        <TextInput label="E-posta" name="email" type="email" inputMode="email" autoCapitalize="none" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={err?.fields.email} autoComplete="off" />
        <PasswordInput label="Geçici şifre" name="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} error={err?.fields.password} />
        <div>
          <div className="na-label mb-2">Rol</div>
          <GlassSegment<'user' | 'admin'> full value={v.role} onChange={(role) => setV({ ...v, role })} options={[{ value: 'user', label: 'Kullanıcı' }, { value: 'admin', label: 'Admin' }]} />
        </div>
        <FormError message={err && Object.keys(err.fields).length === 0 ? err.message : null} />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={create.isPending}>{create.isPending ? 'Oluşturuluyor…' : 'Kullanıcıyı oluştur'}</Button>
      </form>
    </Sheet>
  )
}

function UserSheet({ user, self, onClose }: { user: AdminUserDTO | null; self: boolean; onClose: () => void }) {
  const patch = useAdminPatchUser()
  const del = useAdminDeleteUser()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    setPassword('')
    patch.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])
  if (!user) return null
  const err = patch.error instanceof ApiError ? patch.error : del.error instanceof ApiError ? del.error : null
  const run = (body: Parameters<typeof patch.mutate>[0]) => patch.mutate(body, { onSuccess: onClose })

  return (
    <>
      <Sheet open={!!user && !confirm} onOpenChange={(o) => !o && onClose()} title={user.name} description={`${user.email} · son giriş ${ago(user.last_login_at)}`}>
        <div className="flex flex-col gap-2.5 pb-2">
          {!self ? (
            <>
              <Button className="w-full" icon="shield" onClick={() => run({ uid: user.uid, role: user.role === 'admin' ? 'user' : 'admin' })}>
                {user.role === 'admin' ? 'Admin yetkisini kaldır' : 'Admin yap'}
              </Button>
              <Button className="w-full" icon={user.status === 'disabled' ? 'check' : 'close'} onClick={() => run({ uid: user.uid, status: user.status === 'disabled' ? 'active' : 'disabled' })}>
                {user.status === 'disabled' ? 'Hesabı etkinleştir' : 'Hesabı devre dışı bırak'}
              </Button>
            </>
          ) : null}
          <GlassCard className="flex flex-col gap-2.5 p-3.5" radius={16}>
            <PasswordInput label="Şifre sıfırla" name="reset" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={err?.fields.password} />
            <Button disabled={password.length < 8 || patch.isPending} onClick={() => run({ uid: user.uid, password })}>Yeni şifreyi ata</Button>
            <div className="text-[11px] text-na-text-3">{self ? 'Kendi şifreniz hemen değişir.' : 'Kullanıcının oturumları kapanır; ilk girişte şifreyi değiştirmesi istenir.'}</div>
          </GlassCard>
          <FormError message={err && !err.fields.password ? err.message : null} />
          {!self ? <Button variant="danger" icon="trash" className="w-full" onClick={() => setConfirm(true)}>Kullanıcıyı sil</Button> : null}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Kullanıcı silinsin mi?"
        description={`${user.email} ve tüm desteleri, kartları, medyası kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Kalıcı olarak sil"
        busy={del.isPending}
        onConfirm={() => del.mutate(user.uid, { onSuccess: () => { setConfirm(false); onClose() } })}
      />
    </>
  )
}

function GlobalSettings() {
  const { data } = useQuery(adminSettingsQuery)
  const put = useAdminPutSettings()
  const [intervals, setIntervals] = useState('')
  const [goal, setGoal] = useState('')
  const [mb, setMb] = useState('')
  const [name, setName] = useState('')
  const [aiOn, setAiOn] = useState<'on' | 'off'>('on')
  const [aiLimit, setAiLimit] = useState('')
  const { data: stats } = useQuery(adminStatsQuery)
  useEffect(() => {
    if (!data) return
    setAiOn(data.ai_enabled ? 'on' : 'off')
    setAiLimit(String(data.ai_daily_limit))
    setIntervals(data.srs_intervals.join(', '))
    setGoal(String(data.default_daily_goal))
    setMb(String(Math.round((data.upload_max_bytes / 1024 / 1024) * 10) / 10))
    setName(data.app_name)
  }, [data])
  const err = put.error instanceof ApiError ? put.error : null
  if (!data) return null

  return (
    <Section top={22}>
      <h2 className="na-display mb-2.5 text-[17px]">Genel ayarlar</h2>
      <GlassCard className="p-4" radius={20}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            put.mutate({
              srs_intervals: intervals.split(/[,\s]+/).filter(Boolean).map(Number),
              default_daily_goal: Number(goal),
              upload_max_bytes: Math.round(Number(mb) * 1024 * 1024),
              app_name: name,
              ai_enabled: aiOn === 'on',
              ai_daily_limit: Number(aiLimit),
            })
          }}
        >
          <TextInput label="SRS aralıkları (gün)" name="intervals" inputMode="numeric" value={intervals} onChange={(e) => setIntervals(e.target.value)} error={err?.fields.srs_intervals} className="na-input na-mono" />
          <div className="grid grid-cols-2 gap-2.5">
            <TextInput label="Varsayılan hedef" name="goal" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} error={err?.fields.default_daily_goal} />
            <TextInput label="Yükleme sınırı (MB)" name="mb" inputMode="decimal" value={mb} onChange={(e) => setMb(e.target.value)} error={err?.fields.upload_max_bytes} />
          </div>
          <TextInput label="Uygulama adı" name="app_name" value={name} onChange={(e) => setName(e.target.value)} error={err?.fields.app_name} />
          <div className="na-glass flex flex-col gap-3 p-3.5" style={{ borderRadius: 14 }}>
            <div className="flex items-center gap-2">
              <Icon name="sparkle" size={15} color="#A78BFA" />
              <span className="flex-1 text-[13px] font-semibold">AI ile kart üretme</span>
              <Pill tone={stats?.ai_configured ? 'accent' : undefined}>{stats?.ai_configured ? stats.ai_model : 'Anahtar yok'}</Pill>
            </div>
            {stats?.ai_configured ? (
              <div className="text-[11px] text-na-text-3">Bugün {stats.ai_requests_today} istek · {stats.ai_cards_today} kart · {stats.ai_tokens_today.toLocaleString('tr-TR')} token</div>
            ) : (
              <div className="text-[11px] leading-normal text-na-text-3">Açmak için sunucuyu <span className="na-mono">ANTHROPIC_API_KEY</span> ortam değişkeniyle başlatın.</div>
            )}
            <div className="grid grid-cols-2 items-end gap-2.5">
              <GlassSegment<'on' | 'off'> full ariaLabel="AI ile üretme" value={aiOn} onChange={setAiOn} options={[{ value: 'on', label: 'Açık' }, { value: 'off', label: 'Kapalı' }]} />
              <TextInput label="Günlük istek / kullanıcı" name="ai_limit" inputMode="numeric" value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} error={err?.fields.ai_daily_limit} />
            </div>
          </div>
          <div className="text-[11px] leading-normal text-na-text-3">Aralık değişikliği yeni cevaplardan itibaren tüm kullanıcılara uygulanır. Kısaltılan merdivende üst seviyedeki kartlar en üst seviyeye çekilir.</div>
          {put.isSuccess ? <div className="text-xs text-na-accent">Kaydedildi ✓</div> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={put.isPending}>{put.isPending ? 'Kaydediliyor…' : 'Ayarları kaydet'}</Button>
        </form>
      </GlassCard>
    </Section>
  )
}
