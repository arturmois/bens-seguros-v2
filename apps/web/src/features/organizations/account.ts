import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { getGetMeQueryOptions } from '@/api/endpoints'
import type { GetMe200 } from '@/api/model'
import { ApiError } from '@/lib/http'

// Session, then terms. Organization comes after, and only for the app layout (door 3).
export async function signedInAccount(queryClient: QueryClient, href: string): Promise<GetMe200> {
  try {
    const me = await queryClient.ensureQueryData(getGetMeQueryOptions())
    if (me.terms.pending) {
      throw redirect({ to: '/terms-acceptance', search: { redirect: href } })
    }
    return me
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect({ to: '/login', search: { redirect: href } })
    }
    throw error
  }
}

// Where a signed-in user with accepted terms goes when the active membership is missing.
export function brokerageDestination(me: GetMe200): '/onboarding' | '/select-org' | null {
  if (me.activeOrganizationId && me.role) return null
  return me.organizations.length === 0 ? '/onboarding' : '/select-org'
}
