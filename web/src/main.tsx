import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ApiError } from './api/client'
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
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
