import type { CardDTO } from '@/api/types.gen'
import { Icon } from '@/components/icons'
import { CARD_TYPES, NEUTRAL, tint, type CardType } from '@/components/ui/categories'
import { dueLabel } from '@/lib/format'

/** Compact card list row (design: browse.jsx CardRow). */
export function CardRow({ card, color, onClick }: { card: CardDTO; color?: string; onClick?: () => void }) {
  const t = CARD_TYPES[card.type as CardType] ?? CARD_TYPES.word
  const c = color ?? t.color ?? NEUTRAL
  return (
    <button type="button" onClick={onClick} className="na-glass flex w-full items-center gap-3 px-3.5 py-3 text-left" style={{ borderRadius: 16 }}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: tint(c, 18), color: c, border: `0.5px solid ${tint(c, 35)}` }}>
        <Icon name={t.icon} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tracking-[-0.005em]">{card.front || '—'}</div>
        <div className="mt-0.5 truncate text-xs text-na-text-3">{card.back}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="na-mono text-[11px] text-na-text-3">L{card.level}</div>
        <div className="mt-0.5 text-[10px] text-na-text-4">{dueLabel(card.due_at)}</div>
      </div>
    </button>
  )
}
