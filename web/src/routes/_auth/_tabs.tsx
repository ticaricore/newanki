import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { settingsQuery } from '@/api/queries'
import { AppShell } from '@/components/layout/AppShell'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { SyncBadge } from '@/components/layout/SyncBadge'

/** Main tab screens: shows the floating tab bar; sends first-time users to onboarding. */
export const Route = createFileRoute('/_auth/_tabs')({
  beforeLoad: async ({ context }) => {
    const s = await context.queryClient.ensureQueryData(settingsQuery)
    if (!s.onboarded) throw redirect({ to: '/onboarding' })
  },
  component: () => (
    <AppShell withTabBar>
      <Outlet />
      <SyncBadge />
      <BottomTabBar />
    </AppShell>
  ),
})
