import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getGetMeQueryKey,
  getGetMeQueryOptions,
  useGetMe,
  useSetActiveOrganization,
} from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { FormAlert } from '@/features/auth/components/form-alert'
import { signedInAccount } from '@/features/organizations/account'
import { ApiError } from '@/lib/http'

export const Route = createFileRoute('/(onboarding)/select-org')({
  beforeLoad: ({ context, location }) => signedInAccount(context.queryClient, location.href),
  component: SelectOrg,
})

function SelectOrg() {
  const me = useGetMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActive = useSetActiveOrganization()
  const [failure, setFailure] = useState<string>()
  const organizations = me.data?.organizations ?? []

  async function choose(organizationId: string) {
    setFailure(undefined)
    try {
      await setActive.mutateAsync({ data: { organizationId } })
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
      await queryClient.fetchQuery(getGetMeQueryOptions())
      await navigate({ to: '/dashboard' })
    } catch (error) {
      if (error instanceof ApiError) setFailure(error.message)
      else setFailure('Não foi possível concluir. Tente de novo.')
    }
  }

  return (
    <AuthCard
      title="Escolher corretora"
      description="Selecione em qual corretora você quer entrar."
    >
      {failure && <FormAlert>{failure}</FormAlert>}
      <div className="flex flex-col gap-2">
        {organizations.map((organization) => (
          <Button
            key={organization.id}
            type="button"
            variant="outline"
            onClick={() => choose(organization.id)}
          >
            {organization.name}
          </Button>
        ))}
      </div>
    </AuthCard>
  )
}
