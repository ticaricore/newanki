import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { registerSW } from 'virtual:pwa-register'
import { ApiError, api } from './api/client'
import { qk } from './api/queries'
import type { MeResponse } from './api/types.gen'
import { persistQueries } from './offline/persist'
import { onAnswersSynced } from './offline/sync'
import { ThemeProvider } from './theme/ThemeProvider'
import { routeTree } from './routeTree.gen'
import './styles/theme.css'

function onApiError(err: unknown) {
  if (!(err instanceof ApiError)) return
  const path = window.location.pathname
  if (err.status === 401 && path !== '/login') {
    queryClient.clear()
    void router.navigate({ to: '/login', search: { redirect: path === '/' ? undefined : path } })
  } else if (err.code === 'password_change_required' && path !== '/change-password') {
    void router.navigate({ to: '/change-password' })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      // Try the network even when the browser says offline; on failure the cached data stays on screen.
      networkMode: 'offlineFirst',
      retry: (count, err) => {
        if (!(err instanceof ApiError)) return count < 2
        if (err.status === 0) return navigator.onLine && count < 1
        return err.status >= 500 && count < 2
      },
    },
    // Fail fast offline so forms can say so, instead of pausing until the connection returns.
    mutations: { networkMode: 'always' },
  },
})

onAnswersSynced(() => {
  void queryClient.invalidateQueries({ queryKey: qk.decks })
  void queryClient.invalidateQueries({ queryKey: qk.stats })
  void queryClient.invalidateQueries({ queryKey: ['cards'] })
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/**
 * The restored cache may belong to another session (expired cookie, different user). When the server
 * is reachable, confirm who is signed in before the first render; offline, trust the cached user.
 */
async function revalidateSession() {
  const cached = queryClient.getQueryData<MeResponse>(qk.me)
  if (!cached) return
  try {
    const me = await api<MeResponse>('GET', '/me', undefined, { signal: AbortSignal.timeout(4000) })
    if (me.user.uid !== cached.user.uid) queryClient.clear()
    queryClient.setQueryData(qk.me, me)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) queryClient.clear()
  }
}

registerSW({ immediate: true })
await persistQueries(queryClient)
await revalidateSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
