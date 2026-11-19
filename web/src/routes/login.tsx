import { useForm } from '@tanstack/react-form'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import { meQuery, useLogin } from '@/api/queries'
import { AppShell } from '@/components/layout/AppShell'
import { Button, GlassCard } from '@/components/ui/glass'
import { FormError, PasswordInput, TextInput, firstError } from '@/components/ui/form'
import { Logo } from '@/components/ui/Logo'

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof s.redirect === 'string' && s.redirect.startsWith('/') && !s.redirect.startsWith('//') ? s.redirect : undefined,
  }),
  beforeLoad: async ({ context }) => {
    // Already signed in → skip the form.
    const me = await context.queryClient.fetchQuery(meQuery).catch(() => null)
    if (me) throw redirect({ to: me.user.must_change_password ? '/change-password' : '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: to } = Route.useSearch()
  const navigate = useNavigate()
  const login = useLogin()
  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      const me = await login.mutateAsync(value)
      if (me.user.must_change_password) await navigate({ to: '/change-password' })
      else await navigate({ to: to ?? '/' })
    },
  })
  const serverError = login.error instanceof ApiError ? login.error.message : login.error ? 'Giriş yapılamadı' : null

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col justify-center px-[22px] py-10">
        <div className="na-enter">
          <div>
            <Logo />
          </div>
          <div className="mt-7 text-center">
            <h1 className="na-display text-[32px] leading-[1.05] tracking-[-0.035em]">Tekrar hoş geldin.</h1>
            <p className="mt-2 text-sm text-na-text-2">Hesabına giriş yap ve kaldığın yerden devam et.</p>
          </div>
          <GlassCard strong className="mt-8 p-5" radius={24}>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
              }}
            >
              <form.Field name="email" validators={{ onSubmit: ({ value }) => (!value.includes('@') ? 'Geçerli bir e-posta girin' : undefined) }}>
                {(f) => (
                  <TextInput
                    label="E-posta" name={f.name} type="email" inputMode="email" autoComplete="username" autoCapitalize="none"
                    placeholder="ornek@eposta.com" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}
                    error={firstError(f.state.meta.errors)}
                  />
                )}
              </form.Field>
              <form.Field name="password" validators={{ onSubmit: ({ value }) => (!value ? 'Şifre gerekli' : undefined) }}>
                {(f) => (
                  <PasswordInput
                    label="Şifre" name={f.name} autoComplete="current-password" value={f.state.value}
                    onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} error={firstError(f.state.meta.errors)}
                  />
                )}
              </form.Field>
              <FormError message={serverError} />
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(busy) => (
                  <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" disabled={busy}>
                    {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </GlassCard>
          <p className="mt-5 text-center text-xs text-na-text-3">Hesabınız yok mu? Yöneticinizden davet isteyin.</p>
        </div>
      </div>
    </AppShell>
  )
}
