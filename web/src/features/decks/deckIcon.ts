import type { IconName } from '@/components/icons'

const KNOWN: IconName[] = ['textT', 'book', 'image', 'speaker', 'globe', 'brain', 'star', 'heart', 'layers']

/** Deck icon: the stored one if known, else a text icon. */
export function deckIcon(icon: string): IconName {
  return (KNOWN as string[]).includes(icon) ? (icon as IconName) : 'textT'
}

export const DECK_ICONS = KNOWN
export const DECK_COLORS = ['#60A5FA', '#A78BFA', '#34D399', '#F472B6', '#FCD34D', '#FB923C', '#FB7185', '#94A3B8']
