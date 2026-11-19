import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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

  const value = useMemo<ThemeCtx>(
    () => ({
      prefs,
      resolved: resolveTheme(prefs.theme, prefersDark),
      setPrefs: (p) => setState((cur) => ({ ...cur, ...p })),
    }),
    [prefs, prefersDark],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>')
  return v
}
