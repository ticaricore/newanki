// IndexedDB for offline study: the answer outbox, downloaded study queues and the persisted query cache.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CardDTO } from '@/api/types.gen'

/** An answer given on this device that the server has not acknowledged yet. */
export interface OutboxItem {
  uid: string
  user_uid: string
  card_uid: string
  correct: boolean
  client_ts: number
  duration_ms: number
  /** Locally computed outcome, used to hide the card from offline queues until the server answers. */
  level_after: number
  due_at: number
  attempts: number
}

/** A study queue downloaded for offline use (server state at fetched_at). */
export interface Snapshot {
  key: string
  user_uid: string
  deck_key: string
  cards: CardDTO[]
  fetched_at: number
}

interface NaDB extends DBSchema {
  outbox: { key: string; value: OutboxItem; indexes: { by_user: string } }
  snapshots: { key: string; value: Snapshot; indexes: { by_user: string } }
  kv: { key: string; value: unknown }
}

let dbp: Promise<IDBPDatabase<NaDB>> | null = null

export function idb() {
  dbp ??= openDB<NaDB>('newanki', 1, {
    upgrade(d) {
      d.createObjectStore('outbox', { keyPath: 'uid' }).createIndex('by_user', 'user_uid')
      d.createObjectStore('snapshots', { keyPath: 'key' }).createIndex('by_user', 'user_uid')
      d.createObjectStore('kv')
    },
    blocking() {
      // A newer tab wants to upgrade the schema: let it.
      void dbp?.then((d) => d.close())
      dbp = null
    },
  })
  return dbp
}
