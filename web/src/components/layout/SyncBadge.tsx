import { Icon } from '@/components/icons'
import { useSyncState } from '@/offline/sync'

/** Floating status above the tab bar: shown only while offline or while answers wait to be sent. */
export function SyncBadge() {
  const s = useSyncState()
  if (s.online && s.pending === 0) return null
  const text = !s.online
    ? s.pending > 0 ? `Çevrimdışı · ${s.pending} cevap bekliyor` : 'Çevrimdışı · kayıtlı verilerle çalışıyorsun'
    : `${s.pending} cevap gönderiliyor…`
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{ bottom: 'calc(var(--tabbar-space) - 14px)' }}
    >
      <div className="na-glass na-glass--strong inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-na-text-2" style={{ borderRadius: 999 }}>
        <Icon name={s.online ? 'cloudUp' : 'wifiOff'} size={13} className={s.online ? 'text-na-accent' : 'text-na-warn'} />
        {text}
      </div>
    </div>
  )
}
