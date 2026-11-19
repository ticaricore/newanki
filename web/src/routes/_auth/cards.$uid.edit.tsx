import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { cardQuery, decksQuery } from '@/api/queries'
import { AppShell } from '@/components/layout/AppShell'
import { Spinner } from '@/components/ui/glass'
import { CardEditor } from '@/features/cards/CardEditor'

export const Route = createFileRoute('/_auth/cards/$uid/edit')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(cardQuery(params.uid)), context.queryClient.ensureQueryData(decksQuery)]),
  component: EditCard,
})

function EditCard() {
  const { uid } = Route.useParams()
  const { data: card } = useQuery(cardQuery(uid))
  const router = useRouter()
  const navigate = useNavigate()
  const close = () => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/browse' }))
  return (
    <AppShell>
      {card ? <CardEditor key={card.uid} card={card} onClose={close} onSaved={close} /> : <div className="flex justify-center pt-24"><Spinner /></div>}
    </AppShell>
  )
}
