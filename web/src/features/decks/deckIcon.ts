import type { IconName } from '@/components/icons'

const KNOWN: IconName[] = ['textT', 'book', 'image', 'speaker', 'globe', 'brain', 'star', 'heart', 'layers']

/** Deck icon: stored icon if known, else derived from the category like the design does. */
export function deckIcon(icon: string, category: string): IconName {
  if ((KNOWN as string[]).includes(icon)) return icon as IconName
  if (category === 'kuran') return 'book'
  if (category === 'biyoloji') return 'image'
  return 'textT'
}

export const DECK_ICONS = KNOWN
export const DECK_COLORS = ['#60A5FA', '#A78BFA', '#34D399', '#F472B6', '#FCD34D', '#FB923C', '#FB7185', '#94A3B8']
