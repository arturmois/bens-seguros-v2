import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import {
  getGetMeQueryKey,
  getGetMeQueryOptions,
  useAcceptInvitation,
  useGetMe,
  useGetPublicInvitation,
} from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { FormAlert } from '@/features/auth/components/form-alert'
import { roleLabel } from '@/features/organizations/labels'
import { ApiError } from '@/lib/http'

const searchSchema = z.object({
  token: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/(onboarding)/accept-invitation')({
  validateSearch: searchSchema,
  component: AcceptInvitation,
})

function AcceptInvitation() {
  const { token } = Route.useSearch()
  const preview = useGetPublicInvitation(token ?? '', {
    query: { enabled: Boolean(token), retry: false },
  })
  const me = useGetMe({ query: { retry: false } })

  if (!token) {
    return (
      <AuthCard title="Convite">
        <p>Convite não encontrado.</p>
      </AuthCard>
    )
  }

  if (
    preview.isPending ||
    (preview.isSuccess && preview.data.status === 'PENDING' && me.isPending)
  ) {
    return (
      <AuthCard title="Convite">
        <p>Carregando o convite…</p>
      </AuthCard>
    )
  }

  if (preview.isError || !preview.data) {
    const message =
      preview.error instanceof ApiError ? preview.error.message : 'Convite não encontrado.'
    return (
      <AuthCard title="Convite">
        <p>{message}</p>
      </AuthCard>
    )
  }

  const invitation = preview.data
  if (invitation.status === 'EXPIRED') {
    return (
      <AuthCard title={invitation.organizationName}>
        <p>Este convite expirou.</p>
      </AuthCard>
    )
  }
  if (invitation.status === 'REVOKED' || invitation.status === 'ACCEPTED') {
    return (
      <AuthCard title={invitation.organizationName}>
        <p>Este convite não está mais aberto.</p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={invitation.organizationName} description={roleLabel(invitation.role)}>
      {me.isSuccess ? (
        <AcceptForm token={token} />
      ) : (
        <Link
          to="/login"
          search={{ redirect: `/accept-invitation?token=${token}` }}
          className="text-primary underline underline-offset-4"
        >
          Entrar para aceitar
        </Link>
      )}
    </AuthCard>
  )
}

function AcceptForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accept = useAcceptInvitation()
  const [failure, setFailure] = useState<string>()

  async function onAccept() {
    setFailure(undefined)
    try {
      await accept.mutateAsync({ data: { token } })
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
      await queryClient.fetchQuery(getGetMeQueryOptions())
      await navigate({ to: '/dashboard' })
    } catch (error) {
      if (error instanceof ApiError) setFailure(error.message)
      else setFailure('Não foi possível concluir. Tente de novo.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {failure && <FormAlert>{failure}</FormAlert>}
      <Button type="button" onClick={onAccept} disabled={accept.isPending}>
        {accept.isPending ? 'Aguarde…' : 'Aceitar convite'}
      </Button>
    </div>
  )
}
