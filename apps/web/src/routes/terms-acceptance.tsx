import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { getGetMeQueryOptions, useAcceptTerms, useGetMe } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { FormAlert } from '@/features/auth/components/form-alert'
import { safeRedirect } from '@/lib/auth-client'
import { ApiError } from '@/lib/http'

const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/terms-acceptance')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(getGetMeQueryOptions())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw redirect({ to: '/login', search: { redirect: location.href } })
      }
      throw error
    }
  },
  component: TermsAcceptance,
})

function TermsAcceptance() {
  const { redirect: next } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useGetMe()
  const accept = useAcceptTerms()
  const [failure, setFailure] = useState<string>()
  const versions = me.data?.terms

  async function onAccept() {
    if (!versions) return
    setFailure(undefined)
    try {
      await accept.mutateAsync({
        data: { termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion },
      })
      await queryClient.fetchQuery(getGetMeQueryOptions())
      await navigate({ href: safeRedirect(next) })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFailure(error.message)
        await queryClient.fetchQuery(getGetMeQueryOptions())
        return
      }
      setFailure(
        error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente de novo.',
      )
    }
  }

  return (
    <AuthCard
      title="Termos e privacidade"
      description="Para usar a Bens Seguros, aceite a versão corrente dos dois documentos."
    >
      {failure && <FormAlert>{failure}</FormAlert>}
      <p className="text-sm">
        Li e aceito os{' '}
        <Link to="/terms" target="_blank" className="text-primary underline underline-offset-4">
          Termos de Uso
        </Link>{' '}
        e a{' '}
        <Link to="/privacy" target="_blank" className="text-primary underline underline-offset-4">
          Política de Privacidade
        </Link>
        .
      </p>
      <Button type="button" disabled={accept.isPending || !versions} onClick={onAccept}>
        {accept.isPending ? 'Aguarde…' : 'Li e aceito'}
      </Button>
    </AuthCard>
  )
}
