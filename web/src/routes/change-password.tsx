import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import { meQuery, useChangePassword, useLogout } from '@/api/queries'
import { AppShell } from '@/components/layout/AppShell'
import { TopBar, TopBarIcon } from '@/components/layout/TopBar'
import { Button, GlassCard, IconBadge } from '@/components/ui/glass'
import { FormError, PasswordInput, firstError } from '@/components/ui/form'

export const Route = createFileRoute('/change-password')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery).catch(() => null)
    if (!me) throw redirect({ to: '/login' })
  },
  component: ChangePasswordPage,
})

const policy = (v: string) => {
  if (v.length < 8) return 'En az 8 karakter olmalı'
  if (!/\p{L}/u.test(v) || !/\d/.test(v)) return 'En az bir harf ve bir rakam içermeli'
  return undefined
}

function ChangePasswordPage() {
  const { data: me } = useQuery(meQuery)
  const forced = !!me?.user.must_change_password
  const change = useChangePassword()
  const logout = useLogout()
  const navigate = useNavigate()
  const router = useRouter()

  const form = useForm({
    defaultValues: { current: '', next: '', confirm: '' },
    onSubmit: async ({ value }) => {
      await change.mutateAsync({ current_password: value.current, new_password: value.next })
      await navigate({ to: '/' })
    },
  })
  const err = change.error instanceof ApiError ? change.error : null

  return (
    <AppShell>
      <TopBar
        title="Şifre"
        leading={
          forced ? (
            <Button size="sm" variant="ghost" onClick={() => logout.mutate(undefined, { onSettled: () => navigate({ to: '/login' }) })}>
              Çıkış
            </Button>
          ) : (
            <TopBarIcon name="close" label="Kapat" onClick={() => router.history.back()} />
          )
        }
      />
      <div className="na-enter px-[18px] pt-2">
        <GlassCard strong glow="rgba(252,211,77,0.35)" className="p-4" radius={22}>
          <div className="relative flex items-start gap-3">
            <IconBadge icon="key" color="#FCD34D" />
            <div>
              <div className="na-display text-[16px]">{forced ? 'Yeni bir şifre belirleyin' : 'Şifreyi değiştir'}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-na-text-2">
                {forced
                  ? 'Hesabınız geçici bir şifreyle oluşturuldu. Devam etmeden önce yalnızca sizin bildiğiniz bir şifre belirleyin.'
                  : 'Şifreniz değişince diğer cihazlardaki oturumlar kapatılır.'}
              </div>
            </div>
          </div>
        </GlassCard>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="current" validators={{ onSubmit: ({ value }) => (!value ? 'Mevcut şifre gerekli' : undefined) }}>
            {(f) => (
              <PasswordInput label="Mevcut şifre" name={f.name} autoComplete="current-password" value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.current_password)} />
            )}
          </form.Field>
          <form.Field name="next" validators={{ onChange: ({ value }) => (value ? policy(value) : undefined), onSubmit: ({ value }) => policy(value) }}>
            {(f) => (
              <PasswordInput label="Yeni şifre" name={f.name} autoComplete="new-password" value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors, err?.fields.new_password)} />
            )}
          </form.Field>
          <form.Field
            name="confirm"
            validators={{
              onChangeListenTo: ['next'],
              onChange: ({ value, fieldApi }) => (value && value !== fieldApi.form.getFieldValue('next') ? 'Şifreler eşleşmiyor' : undefined),
              onSubmit: ({ value, fieldApi }) => (value !== fieldApi.form.getFieldValue('next') ? 'Şifreler eşleşmiyor' : undefined),
            }}
          >
            {(f) => (
              <PasswordInput label="Yeni şifre (tekrar)" name={f.name} autoComplete="new-password" value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)} error={firstError(f.state.meta.errors)} />
            )}
          </form.Field>
          <FormError message={err && Object.keys(err.fields).length === 0 ? err.message : null} />
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </AppShell>
  )
}
