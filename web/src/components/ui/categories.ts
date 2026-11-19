import type { IconName } from '../icons'

/** Deck categories from the design (Vento category palette). Unknown categories fall back to neutral. */
export const NA_CAT: Record<string, { color: string; label: string }> = {
  ingilizce: { color: '#60A5FA', label: 'İngilizce' },
  almanca: { color: '#A78BFA', label: 'Almanca' },
  kuran: { color: '#34D399', label: 'Kurʼan' },
  biyoloji: { color: '#F472B6', label: 'Biyoloji' },
  tarih: { color: '#FCD34D', label: 'Tarih' },
  felsefe: { color: '#FB923C', label: 'Felsefe' },
}

export const NEUTRAL = '#94A3B8'

export function categoryColor(k: string | undefined) {
  return (k && NA_CAT[k]?.color) || NEUTRAL
}

export function categoryLabel(k: string | undefined) {
  return (k && NA_CAT[k]?.label) || k || 'Genel'
}

export type CardType = 'word' | 'audio' | 'image' | 'quran'

export const CARD_TYPES: Record<CardType, { label: string; desc: string; icon: IconName; color: string }> = {
  word: { label: 'Kelime', desc: 'Ön + arka, telaffuz', icon: 'textT', color: '#60A5FA' },
  audio: { label: 'Ses', desc: 'Dinleme + yazma', icon: 'speaker', color: '#A78BFA' },
  image: { label: 'Görsel', desc: 'Resim + soru', icon: 'image', color: '#F472B6' },
  quran: { label: 'Kurʼan', desc: 'Ayet + meal + tefsir', icon: 'book', color: '#34D399' },
}

/** Mixes a hex color into transparency, as the design does with color-mix. */
export function tint(color: string, pct: number) {
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`
}
