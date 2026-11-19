import type { ReactNode } from 'react'
import { Icon, type IconName } from '../icons'

/** Top app bar — `large` shows the iOS-style big title under the action row. */
export function TopBar({
  title, subtitle, leading, trailing, large = false,
}: { title?: ReactNode; subtitle?: ReactNode; leading?: ReactNode; trailing?: ReactNode; large?: boolean }) {
  return (
    <header className="px-[22px]" style={{ paddingTop: 'calc(max(var(--sat), 10px) + 8px)', paddingBottom: large ? 6 : 4 }}>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <div className="flex min-w-11 gap-2">{leading}</div>
        {!large && title ? <h1 className="na-display truncate text-[17px] font-semibold">{title}</h1> : <div />}
        <div className="flex min-w-11 justify-end gap-2">{trailing}</div>
      </div>
      {large ? (
        <div className="pt-2.5">
          <h1 className="na-display text-[32px] leading-[1.05] font-semibold tracking-[-0.03em]">{title}</h1>
          {subtitle ? <div className="mt-1 text-[13px] text-na-text-3">{subtitle}</div> : null}
        </div>
      ) : null}
    </header>
  )
}

export function TopBarIcon({
  name, onClick, accent, label,
}: { name: IconName; onClick?: () => void; accent?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="na-glass flex h-11 w-11 items-center justify-center p-0"
      style={{ borderRadius: 13, color: accent ? 'var(--na-accent)' : 'var(--na-text-2)', backdropFilter: 'blur(20px) saturate(160%)' }}
    >
      <Icon name={name} size={18} />
    </button>
  )
}

/** Gradient avatar with the user's initial. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toLocaleUpperCase('tr-TR')
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        color: '#04231A',
        background: 'linear-gradient(135deg, #34D399, #A78BFA)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.3) inset, 0 4px 14px rgba(52,211,153,0.4)',
      }}
    >
      {initial}
    </div>
  )
}
