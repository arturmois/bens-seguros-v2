import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { getGetMeQueryKey, getGetMeQueryOptions, useOnboardOrganization } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { signedInAccount } from '@/features/organizations/account'
import { brokerageNameSchema } from '@/features/organizations/name'
import { ApiError } from '@/lib/http'

export const Route = createFileRoute('/(onboarding)/onboarding')({
  beforeLoad: ({ context, location }) => signedInAccount(context.queryClient, location.href),
  component: Onboarding,
})

function Onboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const onboard = useOnboardOrganization()
  const [failure, setFailure] = useState<string>()
  const form = useForm({
    resolver: zodResolver(brokerageNameSchema),
    defaultValues: { name: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(undefined)
    try {
      await onboard.mutateAsync({ data: { name: values.name } })
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
      await queryClient.fetchQuery(getGetMeQueryOptions())
      await navigate({ to: '/dashboard' })
    } catch (error) {
      if (error instanceof ApiError) setFailure(error.message)
      else setFailure('Não foi possível concluir. Tente de novo.')
    }
  })

  return (
    <AuthCard
      title="Criar corretora"
      description="Dê um nome para a corretora que você administra."
    >
      {failure && <FormAlert>{failure}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="brokerage-name"
          label="Nome"
          autoComplete="organization"
          error={errors.name?.message}
          {...form.register('name')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Criar corretora'}
        </Button>
      </form>
    </AuthCard>
  )
}
