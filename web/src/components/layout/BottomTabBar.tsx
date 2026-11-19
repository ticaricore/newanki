import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Icon, type IconName } from '../icons'

const TABS: { to: string; label: string; icon: IconName; primary?: boolean }[] = [
  { to: '/', label: 'Bugün', icon: 'home' },
  { to: '/decks', label: 'Desteler', icon: 'layers' },
  { to: '/study', label: 'Çalış', icon: 'brain', primary: true },
  { to: '/stats', label: 'İlerleme', icon: 'chart' },
  { to: '/browse', label: 'Ara', icon: 'search' },
]

/** Floating glass tab bar with the green "Çalış" button in the middle. */
export function BottomTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const isActive = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'))

  return (
    <nav
      aria-label="Ana gezinme"
      className="pointer-events-none fixed z-50"
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(calc(100% - 24px), 456px)',
        bottom: 'calc(max(var(--sab), 10px) + 10px)',
      }}
    >
      <div
        className="na-glass na-glass--strong pointer-events-auto flex items-center justify-between p-1.5"
        style={{
          borderRadius: 26,
          height: 'var(--tabbar-h)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.16) inset, 0 -1px 0 rgba(0,0,0,0.20) inset, 0 18px 40px rgba(0,0,0,0.45)',
        }}
      >
        {TABS.map((t) => {
          if (t.primary) {
            return (
              <button
                key={t.to}
                type="button"
                aria-label={t.label}
                onClick={() => {
                  navigator.vibrate?.(8)
                  navigate({ to: '/study' })
                }}
                className="flex h-[52px] w-14 shrink-0 items-center justify-center border-0 active:scale-95"
                style={{
                  borderRadius: 18,
                  color: '#04231A',
                  background: 'linear-gradient(180deg, var(--na-accent) 0%, color-mix(in oklab, var(--na-accent) 70%, #047857) 100%)',
                  boxShadow: '0 0 0 0.5px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.35) inset, 0 8px 20px color-mix(in oklab, var(--na-accent) 45%, transparent)',
                  transition: 'transform 120ms',
                }}
              >
                <Icon name={t.icon} size={22} strokeWidth={2} />
              </button>
            )
          }
          const active = isActive(t.to)
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? 'page' : undefined}
              className="flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 no-underline"
              style={{ color: active ? 'var(--na-text)' : 'var(--na-text-3)', transition: 'color 120ms' }}
            >
              <span className="relative">
                <Icon name={t.icon} size={20} strokeWidth={active ? 2 : 1.5} />
                {active ? (
                  <span
                    className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                    style={{ bottom: -6, background: 'var(--na-accent)', boxShadow: '0 0 8px var(--na-accent)' }}
                  />
                ) : null}
              </span>
              <span className="text-[9.5px] font-semibold tracking-[0.02em]">{t.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/** Big "Çalışmaya başla" CTA from the Home hero. */
export function StudyCTA({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="na-btn na-btn--primary w-full justify-between whitespace-nowrap"
      style={{ height: 60, borderRadius: 20, fontSize: 16, padding: '0 22px', letterSpacing: '-0.01em' }}
    >
      <span className="inline-flex min-w-0 items-center gap-2.5">
        <Icon name="bolt" size={20} strokeWidth={2} />
        {count > 0 ? 'Çalışmaya başla' : 'Bugünlük bitti'}
      </span>
      <span className="na-mono inline-flex items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: 'rgba(0,0,0,0.18)' }}>
          {count} kart
        </span>
        <Icon name="arrowR" size={18} strokeWidth={2} />
      </span>
    </button>
  )
}
