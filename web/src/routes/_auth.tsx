import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import { meQuery, settingsQuery } from '@/api/queries'
import { useTheme } from '@/theme/ThemeProvider'
import type { Density, FontName, ThemeName, VisualDirection } from '@/theme/theme'

/** Requires a signed-in user with no pending password change. */
export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQuery)
      if (me.user.must_change_password) throw redirect({ to: '/change-password' })
      return { me: me.user }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        throw redirect({ to: '/login', search: { redirect: location.pathname === '/' ? undefined : location.href } })
      }
      throw e
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  const { data: settings } = useQuery(settingsQuery)
  const { setPrefs } = useTheme()
  useEffect(() => {
    if (!settings) return
    setPrefs({
      theme: settings.theme as ThemeName,
      accent: settings.accent,
      density: settings.density as Density,
      font: settings.font as FontName,
      vd: settings.vd as VisualDirection,
    })
  }, [settings, setPrefs])
  return <Outlet />
}
