import type { ReactNode } from 'react'

/**
 * Full-viewport app frame: aurora mesh + grain backdrop, phone-width column centered on wide screens.
 * Replaces the design's fixed iPhone frame paddings with safe-area insets.
 */
export function AppShell({ children, withTabBar = false }: { children: ReactNode; withTabBar?: boolean }) {
  return (
    <div className="relative min-h-dvh">
      <div className="na-mesh" aria-hidden />
      <div className="na-grain" aria-hidden />
      <div
        className="relative z-[1] mx-auto w-full max-w-[480px]"
        style={{
          minHeight: '100dvh',
          paddingLeft: 'var(--sal)',
          paddingRight: 'var(--sar)',
          paddingBottom: withTabBar ? 'var(--tabbar-space)' : 'max(var(--sab), 16px)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Horizontal page padding used by every screen (18px in the design). */
export function Section({ children, className = '', top = 14 }: { children: ReactNode; className?: string; top?: number }) {
  return (
    <section className={`px-[18px] ${className}`} style={{ paddingTop: top }}>
      {children}
    </section>
  )
}
