// Glass primitives ported from the design (project/lib/glass.jsx + app.css classes).
import { useMemo, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../icons'
import { categoryColor, tint } from './categories'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ── GlassCard ──────────────────────────────────────────────────────────────
export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
  flat?: boolean
  radius?: number
  /** Soft radial glow in the top-right corner, as on the design's hero cards. */
  glow?: string
}

export function GlassCard({ strong, flat, radius, glow, className, style, children, ...rest }: GlassCardProps) {
  return (
    <div
      className={cx('na-glass', strong && 'na-glass--strong', flat && 'na-glass--flat', glow && 'overflow-hidden', className)}
      style={{ borderRadius: radius, ...style }}
      {...rest}
    >
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-6 h-28 w-28"
          style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)`, filter: 'blur(20px)' }}
        />
      ) : null}
      {children}
    </div>
  )
}

// ── Button ─────────────────────────────────────────────────────────────────
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  icon?: IconName
  iconOnly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<ButtonProps['size']>, CSSProperties> = {
  sm: { height: 36, minHeight: 36, padding: '0 14px', fontSize: 13, borderRadius: 12 },
  md: {},
  lg: { height: 56, fontSize: 15, borderRadius: 18 },
}

export function Button({ variant = 'default', icon, iconOnly, size = 'md', className, style, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'na-btn',
        variant === 'primary' && 'na-btn--primary',
        variant === 'ghost' && 'na-btn--ghost',
        variant === 'danger' && 'na-btn--danger',
        iconOnly && 'na-btn--icon',
        className,
      )}
      style={{ ...SIZE[size], ...style }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

// ── Pill ───────────────────────────────────────────────────────────────────
export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Any hex color; tints background, border and text. */
  color?: string
  tone?: 'accent' | 'danger' | 'warn' | 'info' | 'purple'
  icon?: IconName
}

const TONES: Record<NonNullable<PillProps['tone']>, string> = {
  accent: 'var(--na-accent)',
  danger: 'var(--na-danger)',
  warn: 'var(--na-warn)',
  info: 'var(--na-info)',
  purple: 'var(--na-purple)',
}

export function Pill({ color, tone, icon, className, style, children, ...rest }: PillProps) {
  const c = color ?? (tone ? TONES[tone] : undefined)
  return (
    <span
      className={cx('na-pill', className)}
      style={c ? { background: tint(c, 16), color: c, borderColor: tint(c, 30), ...style } : style}
      {...rest}
    >
      {icon ? <Icon name={icon} size={11} strokeWidth={2} /> : null}
      {children}
    </span>
  )
}

// ── GlassSegment ───────────────────────────────────────────────────────────
export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: IconName
}

export function GlassSegment<T extends string>({
  options, value, onChange, full, ariaLabel,
}: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; full?: boolean; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('na-glass inline-flex p-1', full && 'w-full')} style={{ borderRadius: 14 }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx('inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-xs font-semibold transition-colors', full ? 'flex-1' : 'flex-none')}
            style={{
              borderRadius: 11,
              background: active ? 'var(--na-glass-strong)' : 'transparent',
              border: `0.5px solid ${active ? 'var(--na-glass-border-strong)' : 'transparent'}`,
              boxShadow: active ? '0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 10px rgba(0,0,0,0.18)' : 'none',
              color: active ? 'var(--na-text)' : 'var(--na-text-3)',
              letterSpacing: '-0.005em',
            }}
          >
            {o.icon ? <Icon name={o.icon} size={14} /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Progress ───────────────────────────────────────────────────────────────
export function GlassProgress({ value, max = 1, color, height = 6, label }: { value: number; max?: number; color?: string; height?: number; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: 'var(--na-track)', boxShadow: '0 1px 0 rgba(0,0,0,0.18) inset' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct * 100}%`,
          background: color ?? 'linear-gradient(90deg, var(--na-accent), color-mix(in oklab, var(--na-accent) 70%, #047857))',
          boxShadow: `0 0 14px ${tint('var(--na-accent)', 55)}`,
          transition: 'width 360ms var(--ease-soft)',
        }}
      />
    </div>
  )
}

export function RingProgress({
  size = 80, value = 0.5, stroke = 8, color = 'var(--na-accent)', children,
}: { size?: number; value?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(1, value)))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--na-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 480ms var(--ease-soft)', filter: `drop-shadow(0 0 6px ${tint(color, 40)})` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

// ── Waveform ───────────────────────────────────────────────────────────────
export function Waveform({ bars = 48, height = 38, color = 'currentColor', progress = 0, dim = 0.25 }: { bars?: number; height?: number; color?: string; progress?: number; dim?: number }) {
  const arr = useMemo(
    () => Array.from({ length: bars }, (_, i) => Math.min(1, Math.abs(Math.sin(i * 0.7) + Math.cos(i * 0.31) * 0.6) * 0.5 + 0.2)),
    [bars],
  )
  return (
    <div className="flex w-full items-center gap-0.5" style={{ height }} aria-hidden>
      {arr.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${v * 100}%`,
            minHeight: 3,
            background: i / bars < progress ? color : `color-mix(in oklab, ${color} ${dim * 100}%, transparent)`,
            transition: 'background 180ms',
          }}
        />
      ))}
    </div>
  )
}

// ── StatTile ───────────────────────────────────────────────────────────────
export function StatTile({ label, value, sub, accent, icon }: { label: string; value: ReactNode; sub?: string; accent?: string; icon?: IconName }) {
  return (
    <GlassCard className="relative overflow-hidden p-3.5" radius={18}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-na-text-3">{label}</span>
        {icon ? (
          <div
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px]"
            style={{ background: accent ? tint(accent, 22) : 'var(--na-glass)', color: accent ?? 'var(--na-text-2)' }}
          >
            <Icon name={icon} size={13} />
          </div>
        ) : null}
      </div>
      <div className="na-mono text-[28px] leading-none font-semibold tracking-[-0.02em]" style={{ color: accent ?? 'var(--na-text)' }}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-na-text-3">{sub}</div> : null}
    </GlassCard>
  )
}

// ── Heatmap ────────────────────────────────────────────────────────────────
/** data: 0..1 values, column-major (7 rows per column). */
export function Heatmap({ data, color = 'var(--na-accent)', size = 9, gap = 3, titles }: { data: number[]; color?: string; size?: number; gap?: number; titles?: string[] }) {
  return (
    <div className="grid w-fit" style={{ gridAutoFlow: 'column', gridTemplateRows: `repeat(7, ${size}px)`, gap }}>
      {data.map((v, i) => (
        <div
          key={i}
          title={titles?.[i]}
          style={{
            width: size,
            height: size,
            borderRadius: 3,
            background: v === 0 ? 'var(--na-track)' : `color-mix(in oklab, ${color} ${Math.round(20 + v * 80)}%, transparent)`,
            boxShadow: v > 0.5 ? `0 0 6px color-mix(in oklab, ${color} 50%, transparent)` : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ── CategoryDot ────────────────────────────────────────────────────────────
export function CategoryDot({ k, color, size = 8 }: { k?: string; color?: string; size?: number }) {
  const c = color ?? categoryColor(k)
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: c, boxShadow: `0 0 10px ${c}80` }} />
}

/** Rounded square icon badge tinted with a color (deck rows, setting rows, card types). */
export function IconBadge({ icon, color, size = 38, iconSize = 18, radius = 12 }: { icon: IconName; color: string; size?: number; iconSize?: number; radius?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius, background: tint(color, 22), color, border: `0.5px solid ${tint(color, 40)}` }}
    >
      <Icon name={icon} size={iconSize} strokeWidth={2} />
    </div>
  )
}

// ── Form bits ──────────────────────────────────────────────────────────────
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="na-label mb-2 block">
      {children}
    </label>
  )
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <div role="alert" className="mt-1.5 text-xs text-na-danger">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h2 className="na-display text-[17px] font-semibold">{children}</h2>
      {action}
    </div>
  )
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex gap-1" role="status" aria-label="Yükleniyor">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full"
          style={{ width: size / 2.5, height: size / 2.5, background: 'var(--na-accent)', animation: `na-pulse 1.2s ${i * 0.15}s infinite ease-in-out` }}
        />
      ))}
    </span>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <GlassCard className="flex flex-col items-center px-6 py-8 text-center" radius={22}>
      <IconBadge icon={icon} color="#A78BFA" size={48} iconSize={22} radius={15} />
      <div className="na-display mt-3 text-[17px]">{title}</div>
      {children ? <div className="mt-1.5 text-[13px] leading-relaxed text-na-text-3">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </GlassCard>
  )
}
