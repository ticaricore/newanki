import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { Button, EmptyState } from '@/components/ui/glass'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-[18px]" style={{ paddingTop: 'calc(max(var(--sat), 10px) + 60px)' }}>
        <EmptyState icon="search" title="Sayfa bulunamadı" action={<Link to="/"><Button variant="primary">Ana sayfaya dön</Button></Link>}>
          Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.
        </EmptyState>
      </div>
    </AppShell>
  ),
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="px-[18px]" style={{ paddingTop: 'calc(max(var(--sat), 10px) + 60px)' }}>
        <EmptyState icon="refresh" title="Bir şeyler ters gitti" action={<Button variant="primary" onClick={reset}>Tekrar dene</Button>}>
          {error instanceof Error ? error.message : String(error)}
        </EmptyState>
      </div>
    </AppShell>
  ),
})
