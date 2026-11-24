// Persists the read-only query cache (me, settings, decks, stats) to IndexedDB so screens open offline.
import type { QueryClient } from '@tanstack/react-query'
import { persistQueryClient, type PersistedClient, type Persister } from '@tanstack/react-query-persist-client'
import { idb } from './db'

const KEY = 'query-cache'
const PERSISTED = new Set(['me', 'settings', 'categories', 'decks', 'stats', 'card'])

function idbPersister(): Persister {
  let timer: number | undefined
  let latest: PersistedClient | null = null
  return {
    persistClient(client) {
      // The cache changes often (every fetch); write at most once a second.
      latest = client
      if (timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        const c = latest
        void idb().then((d) => d.put('kv', c, KEY)).catch(() => undefined)
      }, 1000)
    },
    async restoreClient() {
      return (await (await idb()).get('kv', KEY)) as PersistedClient | undefined
    },
    async removeClient() {
      await (await idb()).delete('kv', KEY)
    },
  }
}

/** Restores the cached queries (resolves once done, never rejects) and keeps saving changes. */
export function persistQueries(queryClient: QueryClient): Promise<void> {
  const [, restored] = persistQueryClient({
    queryClient,
    persister: idbPersister(),
    maxAge: 14 * 86_400_000,
    buster: 'v1',
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
    },
  })
  // Never block startup for long on a slow or broken IndexedDB.
  return Promise.race([restored.catch(() => undefined), new Promise<void>((r) => setTimeout(r, 1500))])
}
