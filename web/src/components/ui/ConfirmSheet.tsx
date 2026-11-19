import { Button } from './glass'
import { Sheet } from './Sheet'

/** Bottom-sheet confirmation for destructive actions. */
export function ConfirmSheet({
  open, onOpenChange, title, description, confirmLabel, onConfirm, busy,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex flex-col gap-2.5 pb-2">
        <Button variant="danger" size="lg" className="w-full" onClick={onConfirm} disabled={busy}>
          {busy ? 'Siliniyor…' : confirmLabel}
        </Button>
        <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
          Vazgeç
        </Button>
      </div>
    </Sheet>
  )
}
