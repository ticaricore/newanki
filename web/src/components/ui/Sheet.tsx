import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

/** Mobile bottom sheet (Vaul) styled as strong glass, with a drag handle and safe-area padding. */
export function Sheet({
  open, onOpenChange, title, description, children,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[90]" style={{ background: 'rgba(2,6,23,0.55)' }} />
        <Drawer.Content
          className="na-glass na-glass--strong fixed inset-x-0 bottom-0 z-[100] mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col outline-none"
          style={{
            borderRadius: '26px 26px 0 0',
            background: 'color-mix(in oklab, var(--na-bg-1) 82%, transparent)',
            paddingBottom: 'max(var(--sab), 16px)',
          }}
        >
          <div aria-hidden className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full" style={{ background: 'var(--na-glass-border-strong)' }} />
          <div className="px-[18px] pt-2 pb-3">
            <Drawer.Title className="na-display text-[18px] font-semibold">{title}</Drawer.Title>
            {description ? <Drawer.Description className="mt-1 text-[13px] text-na-text-3">{description}</Drawer.Description> : <Drawer.Description className="sr-only">{title}</Drawer.Description>}
          </div>
          <div className="overflow-y-auto px-[18px] pb-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
