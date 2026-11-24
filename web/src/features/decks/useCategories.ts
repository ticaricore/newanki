import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesQuery } from '@/api/queries'
import type { CategoryDTO } from '@/api/types.gen'

/** The user's deck categories, with lookups by uid (DeckDTO.category). */
export function useCategories() {
  const { data } = useQuery(categoriesQuery)
  return useMemo(() => {
    const list = data ?? []
    const byUid = new Map<string, CategoryDTO>(list.map((c) => [c.uid, c]))
    return { list, byUid, label: (uid: string) => byUid.get(uid)?.name ?? 'Genel' }
  }, [data])
}
