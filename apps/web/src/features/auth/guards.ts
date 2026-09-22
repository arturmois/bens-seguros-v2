import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { getGetMeQueryOptions } from '@/api/endpoints'
import { ApiError } from '@/lib/http'

// Login and sign-up are for signed-out visitors: a live session goes straight to the app.
export async function redirectIfSignedIn(queryClient: QueryClient) {
  const signedIn = await queryClient.fetchQuery(getGetMeQueryOptions()).then(
    () => true,
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return false
      throw error
    },
  )
  if (signedIn) throw redirect({ to: '/dashboard' })
}
