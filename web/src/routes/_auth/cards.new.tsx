import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { decksQuery } from '@/api/queries'
import { AppShell } from '@/components/layout/AppShell'
import { CardEditor } from '@/features/cards/CardEditor'

export const Route = createFileRoute('/_auth/cards/new')({
  validateSearch: (s: Record<string, unknown>): { deck_uid?: string } => ({ deck_uid: typeof s.deck_uid === 'string' ? s.deck_uid : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(decksQuery),
  component: NewCard,
})

function NewCard() {
  const { deck_uid } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate()
  const close = () => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/decks' }))
  return (
    <AppShell>
      <CardEditor
        defaultDeckUid={deck_uid}
        onClose={close}
        onSaved={(c, another) => {
          if (another) {
            navigator.vibrate?.(8) // form was reset in place for the next card
          } else {
            void navigate({ to: '/decks/$uid', params: { uid: c.deck_uid }, replace: true })
          }
        }}
      />
    </AppShell>
  )
}
