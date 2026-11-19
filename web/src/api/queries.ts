// TanStack Query options and mutations for every API endpoint.
import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, uuidv7 } from './client'
import { clearOfflineData, setOfflineUser } from '@/offline/sync'
import type {
  AdminStats, AdminUserCreate, AdminUserDTO, AdminUserListResponse, AdminUserPatch, AppSettings, CardDTO, CardInput,
  CardListResponse, CardPatch, ChangePasswordRequest, DaysResponse, DeckDTO, DeckInput, DeckListResponse, DeckPatch,
  DistributionResponse, LoginRequest, MediaDTO, MeResponse, SettingsPatch, SettingsResponse, StatsSummary,
} from './types.gen'

export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  decks: ['decks'] as const,
  deck: (uid: string) => ['decks', uid] as const,
  cards: (p: CardsParams) => ['cards', p] as const,
  card: (uid: string) => ['card', uid] as const,
  stats: ['stats'] as const,
  admin: ['admin'] as const,
}

// ── Queries ────────────────────────────────────────────────────────────────
export const meQuery = queryOptions({
  queryKey: qk.me,
  queryFn: () => api<MeResponse>('GET', '/me'),
  staleTime: 60_000,
  retry: false,
})

export const settingsQuery = queryOptions({
  queryKey: qk.settings,
  queryFn: () => api<SettingsResponse>('GET', '/settings'),
  staleTime: 5 * 60_000,
})

export const decksQuery = queryOptions({
  queryKey: qk.decks,
  queryFn: () => api<DeckListResponse>('GET', '/decks').then((r) => r.decks),
})

export const deckQuery = (uid: string) =>
  queryOptions({ queryKey: qk.deck(uid), queryFn: () => api<DeckDTO>('GET', `/decks/${uid}`) })

export interface CardsParams {
  deck_uid?: string
  type?: string
  q?: string
}

function qs(p: Record<string, string | undefined>) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v)
  const str = s.toString()
  return str ? `?${str}` : ''
}

export const cardsQuery = (p: CardsParams) =>
  infiniteQueryOptions({
    queryKey: qk.cards(p),
    queryFn: ({ pageParam, signal }) =>
      api<CardListResponse>('GET', `/cards${qs({ ...p, cursor: pageParam || undefined })}`, undefined, { signal }),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor || undefined,
  })

export const cardQuery = (uid: string) =>
  queryOptions({ queryKey: qk.card(uid), queryFn: () => api<CardDTO>('GET', `/cards/${uid}`) })

export const summaryQuery = queryOptions({
  queryKey: [...qk.stats, 'summary'],
  queryFn: () => api<StatsSummary>('GET', '/stats/summary'),
})

export const activityQuery = (days = 14) =>
  queryOptions({
    queryKey: [...qk.stats, 'activity', days],
    queryFn: () => api<DaysResponse>('GET', `/stats/activity?days=${days}`).then((r) => r.days),
  })

export const heatmapQuery = (range: '6m' | '1y') =>
  queryOptions({
    queryKey: [...qk.stats, 'heatmap', range],
    queryFn: () => api<DaysResponse>('GET', `/stats/heatmap?range=${range}`).then((r) => r.days),
  })

export const distributionQuery = queryOptions({
  queryKey: [...qk.stats, 'distribution'],
  queryFn: () => api<DistributionResponse>('GET', '/stats/distribution').then((r) => r.levels),
})

export const adminUsersQuery = queryOptions({
  queryKey: [...qk.admin, 'users'],
  queryFn: () => api<AdminUserListResponse>('GET', '/admin/users').then((r) => r.users),
})

export const adminSettingsQuery = queryOptions({
  queryKey: [...qk.admin, 'settings'],
  queryFn: () => api<AppSettings>('GET', '/admin/settings'),
})

export const adminStatsQuery = queryOptions({
  queryKey: [...qk.admin, 'stats'],
  queryFn: () => api<AdminStats>('GET', '/admin/stats'),
})

// ── Mutations ──────────────────────────────────────────────────────────────
export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginRequest) => api<MeResponse>('POST', '/auth/login', body),
    onSuccess: (me) => {
      qc.clear()
      qc.setQueryData(qk.me, me)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('POST', '/auth/logout'),
    onSettled: async () => {
      const uid = qc.getQueryData<MeResponse>(qk.me)?.user.uid
      setOfflineUser(null)
      if (uid) await clearOfflineData(uid)
      qc.clear()
    },
  })
}

export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => api<void>('PATCH', '/me/password', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  })
}

export function usePatchSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SettingsPatch) => api<SettingsResponse>('PATCH', '/settings', body),
    onSuccess: (s) => {
      qc.setQueryData(qk.settings, s)
      // Day boundaries and goals feed the stats.
      qc.invalidateQueries({ queryKey: qk.stats })
    },
  })
}

function useInvalidateContent() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.decks }),
      qc.invalidateQueries({ queryKey: ['cards'] }),
      qc.invalidateQueries({ queryKey: ['queue'] }),
      qc.invalidateQueries({ queryKey: qk.stats }),
    ])
}

export function useCreateDeck() {
  const inv = useInvalidateContent()
  return useMutation({
    mutationFn: (body: DeckInput) => api<DeckDTO>('POST', '/decks', { uid: uuidv7(), ...body }),
    onSuccess: inv,
  })
}

export function usePatchDeck() {
  const inv = useInvalidateContent()
  return useMutation({
    mutationFn: ({ uid, ...body }: DeckPatch & { uid: string }) => api<DeckDTO>('PATCH', `/decks/${uid}`, body),
    onSuccess: inv,
  })
}

export function useDeleteDeck() {
  const inv = useInvalidateContent()
  return useMutation({ mutationFn: (uid: string) => api<void>('DELETE', `/decks/${uid}`), onSuccess: inv })
}

export function useCreateCard() {
  const inv = useInvalidateContent()
  return useMutation({
    mutationFn: (body: CardInput) => api<CardDTO>('POST', '/cards', { ...body, uid: body.uid ?? uuidv7() }),
    onSuccess: inv,
  })
}

export function usePatchCard() {
  const inv = useInvalidateContent()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, ...body }: CardPatch & { uid: string }) => api<CardDTO>('PATCH', `/cards/${uid}`, body),
    onSuccess: (c) => {
      qc.setQueryData(qk.card(c.uid), c)
      return inv()
    },
  })
}

export function useDeleteCard() {
  const inv = useInvalidateContent()
  return useMutation({ mutationFn: (uid: string) => api<void>('DELETE', `/cards/${uid}`), onSuccess: inv })
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: (file: File | Blob) => {
      const fd = new FormData()
      fd.append('file', file, file instanceof File ? file.name : 'kayit.webm')
      return api<MediaDTO>('POST', '/media', fd)
    },
  })
}

export function useAdminCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminUserCreate) => api<AdminUserDTO>('POST', '/admin/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin }),
  })
}

export function useAdminPatchUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, ...body }: AdminUserPatch & { uid: string }) => api<AdminUserDTO>('PATCH', `/admin/users/${uid}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin }),
  })
}

export function useAdminDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uid: string) => api<void>('DELETE', `/admin/users/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin }),
  })
}

export function useAdminPutSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AppSettings) => api<AppSettings>('PUT', '/admin/settings', body),
    onSuccess: (s) => {
      qc.setQueryData(adminSettingsQuery.queryKey, s)
      qc.invalidateQueries({ queryKey: qk.settings })
    },
  })
}
