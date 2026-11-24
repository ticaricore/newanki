import type { IconName } from '../icons'

export const NEUTRAL = '#94A3B8'

/** Colors offered for categories (the server picks from the same palette when none is given). */
export const CATEGORY_COLORS = ['#F87171', '#60A5FA', '#2DD4BF', '#A78BFA', '#FCD34D', '#F472B6', '#FB923C', '#34D399', '#818CF8', '#94A3B8']

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
