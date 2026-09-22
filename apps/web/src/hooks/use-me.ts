import { useSuspenseQuery } from '@tanstack/react-query'
import { getGetMeQueryKey, getMe } from '@/api/endpoints'

// The signed-in user. Only under `_app`, whose beforeLoad already loaded it (or redirected).
export function useMe() {
  return useSuspenseQuery({
    queryKey: getGetMeQueryKey(),
    queryFn: ({ signal }) => getMe({ signal }),
  }).data
}
