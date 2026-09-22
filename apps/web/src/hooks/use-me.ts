import { useGetMe } from '@/api/endpoints'

// The signed-in user. Only under `_app`, whose beforeLoad already put it in the query cache (or
// redirected), so the data is there on the first render.
export function useMe() {
  const { data } = useGetMe()
  if (!data) throw new Error('useMe outside _app: the user was not loaded')
  return data
}
