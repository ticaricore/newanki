// Theme preferences and how they are applied to <html> (port of ThemedFrame from the design).

export type ThemeName = 'system' | 'dark' | 'light' | 'oled'
export type Density = 'compact' | 'balanced' | 'spacious'
export type FontName = 'geist' | 'inter' | 'sfpro' | 'serif'
export type VisualDirection = 'minimal' | 'glass' | 'character'
export type FlipStyle = 'flip' | 'fade' | 'slide'

export interface ThemePrefs {
  theme: ThemeName
  accent: string
  density: Density
  font: FontName
  vd: VisualDirection
}

export const DEFAULT_PREFS: ThemePrefs = {
  theme: 'dark',
  accent: '#34D399',
  density: 'balanced',
  font: 'geist',
  vd: 'glass',
}

export const ACCENT_OPTIONS = ['#34D399', '#A78BFA', '#F59E0B', '#60A5FA', '#FB7185', '#F472B6'] as const

export const FONT_STACKS: Record<FontName, string> = {
  geist: "'Geist Sans', -apple-system, 'SF Pro Text', system-ui, sans-serif",
  inter: "'Inter', -apple-system, system-ui, sans-serif",
  sfpro: "-apple-system, 'SF Pro Text', BlinkMacSystemFont, system-ui, sans-serif",
  serif: "'Newsreader', 'Source Serif Pro', Georgia, serif",
}

const STORAGE_KEY = 'na:theme'

export function resolveTheme(theme: ThemeName, prefersDark: boolean): Exclude<ThemeName, 'system'> {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

const THEME_COLOR: Record<Exclude<ThemeName, 'system'>, string> = {
  dark: '#07091a',
  oled: '#000000',
  light: '#f5f4f0',
}

export function applyTheme(p: ThemePrefs, prefersDark: boolean) {
  const root = document.documentElement
  const resolved = resolveTheme(p.theme, prefersDark)
  root.dataset.naTheme = resolved
  root.dataset.naDensity = p.density
  root.dataset.naVd = p.vd
  root.style.setProperty('--na-accent', p.accent)
  root.style.setProperty('--na-font-body', FONT_STACKS[p.font] ?? FONT_STACKS.geist)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}

/** Last applied prefs, so the first paint matches before settings load from the server. */
export function loadCachedPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ThemePrefs>) }
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS
}

export function cachePrefs(p: ThemePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}
