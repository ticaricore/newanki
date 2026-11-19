// Offline study: every answer goes to the IndexedDB outbox first and is sent with POST /reviews/batch.
// Downloaded queues (snapshots) let a session start without a connection.
import { useSyncExternalStore } from 'react'
import { ApiError, api } from '@/api/client'
import type { CardDTO, ReviewBatchResponse, StudyQueueResponse } from '@/api/types.gen'
import { idb, type OutboxItem, type Snapshot } from './db'
import { isOnline, onNetworkChange } from './network'

/** Cards due within this many days are downloaded, so an offline session still works after midnight. */
export const AHEAD_DAYS = 3
const QUEUE_LIMIT = 500
const BATCH = 200
const MAX_ATTEMPTS = 8

// ── State for the UI ───────────────────────────────────────────────────────
export interface SyncState {
  online: boolean
  pending: number
  syncing: boolean
  lastSyncAt: number | null
  error: string | null
}

let state: SyncState = { online: isOnline(), pending: 0, syncing: false, lastSyncAt: null, error: null }
const listeners = new Set<() => void>()

function setState(p: Partial<SyncState>) {
  state = { ...state, ...p }
  for (const l of listeners) l()
}

export function useSyncState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

// ── Current user ───────────────────────────────────────────────────────────
let userUid: string | null = null
let onSynced: (() => void) | null = null

/** Called by the signed-in layout. Starts syncing the user's outbox. */
export function setOfflineUser(uid: string | null) {
  if (uid === userUid) return
  userUid = uid
  void refreshPending().then(() => flush())
}

/** Registers a callback (cache invalidation) for after answers reached the server. */
export function onAnswersSynced(cb: () => void) {
  onSynced = cb
}

async function refreshPending() {
  if (!userUid) return setState({ pending: 0 })
  try {
    const n = await (await idb()).countFromIndex('outbox', 'by_user', userUid)
    setState({ pending: n })
  } catch {
    // IndexedDB unavailable (private mode on old browsers): offline study is off, online still works.
  }
}

async function pendingItems(uid: string) {
  const items = await (await idb()).getAllFromIndex('outbox', 'by_user', uid)
  return items.sort((a, b) => a.client_ts - b.client_ts)
}

// ── Outbox ─────────────────────────────────────────────────────────────────
export type Answer = Omit<OutboxItem, 'user_uid' | 'attempts'>

/** Stores an answer durably, then tries to send it right away. */
export async function enqueueAnswer(a: Answer) {
  if (!userUid) return
  const item: OutboxItem = { ...a, user_uid: userUid, attempts: 0 }
  try {
    await (await idb()).put('outbox', item)
  } catch {
    // No IndexedDB: send directly and hope the network holds.
    await sendBatch([item]).catch(() => undefined)
    return
  }
  setState({ pending: state.pending + 1 })
  scheduleFlush(0)
}

let flushing: Promise<void> | null = null
let again = false
let timer: number | undefined

function scheduleFlush(ms: number) {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void flush(), ms)
}

/** Sends every pending answer of the current user. Safe to call often: runs one at a time. */
export function flush(): Promise<void> {
  if (flushing) {
    // Answers added while a batch is in flight go out right after it.
    again = true
    return flushing
  }
  flushing = (async () => {
    do {
      again = false
      await doFlush()
    } while (again && state.online)
  })().finally(() => {
    flushing = null
  })
  return flushing
}

async function doFlush() {
  const uid = userUid
  if (!uid) return
  let items: OutboxItem[]
  try {
    items = await pendingItems(uid)
  } catch {
    return
  }
  if (items.length === 0) return setState({ pending: 0, error: null })
  setState({ syncing: true })
  try {
    for (let i = 0; i < items.length; i += BATCH) {
      if (uid !== userUid) return
      await sendBatch(items.slice(i, i + BATCH))
    }
    setState({ lastSyncAt: Date.now(), error: null })
    onSynced?.()
  } catch (e) {
    const offline = e instanceof ApiError && e.status === 0
    setState({ error: offline ? null : (e as Error).message })
    // Back off while there is still something to send; the online event retries sooner.
    scheduleFlush(offline ? 60_000 : 30_000)
  } finally {
    setState({ syncing: false })
    await refreshPending()
  }
}

async function sendBatch(items: OutboxItem[]) {
  const d = await idb().catch(() => null)
  let res: ReviewBatchResponse
  try {
    res = await api<ReviewBatchResponse>('POST', '/reviews/batch', {
      reviews: items.map((i) => ({ uid: i.uid, card_uid: i.card_uid, correct: i.correct, client_ts: i.client_ts, duration_ms: i.duration_ms })),
    })
  } catch (e) {
    // A 4xx for the whole batch will not get better by retrying forever: give up on an item after a few tries.
    if (d && e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403) {
      const tx = d.transaction('outbox', 'readwrite')
      for (const it of items) {
        if (it.attempts + 1 >= MAX_ATTEMPTS) void tx.store.delete(it.uid)
        else void tx.store.put({ ...it, attempts: it.attempts + 1 })
      }
      await tx.done
    }
    throw e
  }
  if (!d) return
  // Every status (applied, duplicate, stale, rejected) is final: drop the item and keep the
  // downloaded queues in step with the server's answer.
  const byCard = new Map<string, { level_after: number; due_at: number }>()
  for (const r of res.results) if (r.status !== 'rejected') byCard.set(r.card_uid, r) // oldest → newest
  const tx = d.transaction(['outbox', 'snapshots'], 'readwrite')
  for (const it of items) void tx.objectStore('outbox').delete(it.uid)
  const snaps = await tx.objectStore('snapshots').index('by_user').getAll(items[0]!.user_uid)
  for (const s of snaps) {
    let changed = false
    const cards = s.cards.map((c) => {
      const r = byCard.get(c.uid)
      if (!r) return c
      changed = true
      return { ...c, level: r.level_after, due_at: r.due_at }
    })
    if (changed) void tx.objectStore('snapshots').put({ ...s, cards })
  }
  await tx.done
}

// ── Study queues ───────────────────────────────────────────────────────────
const snapKey = (uid: string, deckKey: string) => `${uid}:${deckKey}`

export interface StudyQueue {
  cards: CardDTO[]
  /** true when the queue came from the device because the server could not be reached. */
  offline: boolean
  fetchedAt: number
}

/** Applies answers still in the outbox on top of server data. */
async function overlay(uid: string, cards: CardDTO[]) {
  const items = await pendingItems(uid).catch(() => [] as OutboxItem[])
  if (items.length === 0) return cards
  const last = new Map<string, OutboxItem>()
  for (const it of items) last.set(it.card_uid, it)
  return cards.map((c) => {
    const it = last.get(c.uid)
    return it ? { ...c, level: it.level_after, due_at: it.due_at } : c
  })
}

const dueNow = (cards: CardDTO[], now = Date.now()) =>
  cards.filter((c) => c.due_at <= now).sort((a, b) => a.due_at - b.due_at)

async function saveSnapshot(uid: string, deckKey: string, cards: CardDTO[]) {
  try {
    const s: Snapshot = { key: snapKey(uid, deckKey), user_uid: uid, deck_key: deckKey, cards, fetched_at: Date.now() }
    await (await idb()).put('snapshots', s)
  } catch {
    // Not fatal: the session still runs online.
  }
}

async function loadSnapshot(uid: string, deckUid?: string): Promise<Snapshot | undefined> {
  const d = await idb()
  const own = await d.get('snapshots', snapKey(uid, deckUid ?? 'all'))
  if (own || !deckUid) return own
  const all = await d.get('snapshots', snapKey(uid, 'all'))
  return all && { ...all, cards: all.cards.filter((c) => c.deck_uid === deckUid) }
}

async function fetchQueue(deckUid?: string) {
  const qs = new URLSearchParams({ ahead_days: String(AHEAD_DAYS), limit: String(QUEUE_LIMIT) })
  if (deckUid) qs.set('deck_uid', deckUid)
  // On a flaky connection fall back to the downloaded copy instead of waiting forever.
  return api<StudyQueueResponse>('GET', `/study/queue?${qs}`, undefined, { signal: AbortSignal.timeout(10_000) })
}

/**
 * Cards to study now. Online: sends pending answers, downloads the queue and keeps a copy.
 * Offline: uses the last downloaded copy with this device's answers applied.
 */
export async function loadStudyQueue(uid: string, deckUid?: string): Promise<StudyQueue> {
  try {
    await flush()
    const res = await fetchQueue(deckUid)
    await saveSnapshot(uid, deckUid ?? 'all', res.cards)
    void prefetchMedia(res.cards)
    return { cards: dueNow(await overlay(uid, res.cards)), offline: false, fetchedAt: Date.now() }
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 0)) throw e
    const snap = await loadSnapshot(uid, deckUid).catch(() => undefined)
    if (!snap) throw new ApiError(0, 'offline_no_data', 'Çevrimdışısınız ve bu cihazda indirilmiş kart yok.')
    return { cards: dueNow(await overlay(uid, snap.cards)), offline: true, fetchedAt: snap.fetched_at }
  }
}

let lastPrepared = 0

/**
 * Downloads all decks' upcoming cards (and their media) in the background so the next session works
 * offline. Throttled; skipped while answers are still waiting, so the copy never loses local answers.
 */
export async function prepareOffline(uid: string, force = false) {
  if (!force && Date.now() - lastPrepared < 15 * 60_000) return
  if (!isOnline()) return
  lastPrepared = Date.now()
  try {
    await flush()
    if (state.pending > 0) return
    const res = await fetchQueue()
    await saveSnapshot(uid, 'all', res.cards)
    await prefetchMedia(res.cards)
  } catch {
    lastPrepared = 0
  }
}

/** Info about what is stored for offline study (settings screen). */
export async function offlineInfo(uid: string) {
  const snap = await (await idb()).get('snapshots', snapKey(uid, 'all')).catch(() => undefined)
  return snap ? { cards: snap.cards.length, fetchedAt: snap.fetched_at } : null
}

// ── Media ──────────────────────────────────────────────────────────────────
export const MEDIA_CACHE = 'na-media'

/**
 * Warms the service worker's media cache (CacheFirst on /api/v1/media/*) with full responses, so audio
 * range requests and images work offline. No-op without a controlling service worker.
 */
async function prefetchMedia(cards: CardDTO[]) {
  if (!('caches' in window) || !navigator.serviceWorker?.controller) return
  const urls = [...new Set(cards.map((c) => c.fields.media_uid).filter((u): u is string => !!u))].map((u) => `/api/v1/media/${u}`)
  const cache = await caches.open(MEDIA_CACHE)
  const missing: string[] = []
  for (const u of urls) if (!(await cache.match(u))) missing.push(u)
  const worker = async () => {
    for (let u = missing.shift(); u; u = missing.shift()) {
      await fetch(u, { credentials: 'same-origin' }).catch(() => undefined)
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

/** Removes the signed-out user's downloaded queues and media. Pending answers stay for their next sign-in. */
export async function clearOfflineData(uid: string) {
  try {
    const d = await idb()
    const keys = await d.getAllKeysFromIndex('snapshots', 'by_user', uid)
    const tx = d.transaction('snapshots', 'readwrite')
    for (const k of keys) void tx.store.delete(k)
    await tx.done
  } catch {
    // ignore
  }
  if ('caches' in window) await caches.delete(MEDIA_CACHE).catch(() => false)
}

// ── Triggers ───────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  onNetworkChange(() => {
    setState({ online: isOnline() })
    if (isOnline()) scheduleFlush(500)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.pending > 0) scheduleFlush(0)
  })
}
