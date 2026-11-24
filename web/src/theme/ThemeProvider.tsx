import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyTheme, cachePrefs, loadCachedPrefs, resolveTheme, type ThemePrefs } from './theme'

interface ThemeCtx {
  prefs: ThemePrefs
  resolved: 'dark' | 'light' | 'oled'
  /** Preview or apply prefs locally (persisting to the server is the caller's job). */
  setPrefs: (p: Partial<ThemePrefs>) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

function usePrefersDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<ThemePrefs>(loadCachedPrefs)
  const prefersDark = usePrefersDark()

  useEffect(() => {
    applyTheme(prefs, prefersDark)
    cachePrefs(prefs)
  }, [prefs, prefersDark])

  // Stable, and a no-op when nothing changes: callers sync server settings from an effect.
  const setPrefs = useCallback((p: Partial<ThemePrefs>) => {
    setState((cur) => {
      const changed = (Object.keys(p) as (keyof ThemePrefs)[]).some((k) => p[k] !== undefined && p[k] !== cur[k])
      return changed ? { ...cur, ...p } : cur
    })
  }, [])

  const value = useMemo<ThemeCtx>(
    () => ({ prefs, resolved: resolveTheme(prefs.theme, prefersDark), setPrefs }),
    [prefs, prefersDark, setPrefs],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>')
  return v
}
