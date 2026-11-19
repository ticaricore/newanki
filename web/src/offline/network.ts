// Reachability of the API as seen by the last requests. navigator.onLine alone is unreliable
// (captive portals, server down), so the API client reports every success and network failure here.

type Listener = () => void

let reachable = typeof navigator === 'undefined' ? true : navigator.onLine
const listeners = new Set<Listener>()

function set(v: boolean) {
  if (v === reachable) return
  reachable = v
  for (const l of listeners) l()
}

export function reportNetwork(ok: boolean) {
  set(ok)
}

export function isOnline() {
  return reachable
}

export function onNetworkChange(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => set(true))
  window.addEventListener('offline', () => set(false))
}
