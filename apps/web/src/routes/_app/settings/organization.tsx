import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  getGetOrganizationQueryKey,
  useGetOrganization,
  useRenameOrganization,
} from '@/api/endpoints'
import type { GetOrganization200 } from '@/api/model'
import { Button } from '@/components/ui/button'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { brokerageNameSchema } from '@/features/organizations/name'
import { useMe } from '@/hooks/use-me'
import { ApiError } from '@/lib/http'

export const Route = createFileRoute('/_app/settings/organization')({
  component: OrganizationSettings,
})

function OrganizationSettings() {
  const organization = useGetOrganization()

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">Corretora</h1>
      {organization.isPending ? <p>Carregando a corretora…</p> : null}
      {organization.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p>Não foi possível carregar a corretora.</p>
          <Button type="button" variant="outline" onClick={() => organization.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {organization.data ? <OrganizationForm organization={organization.data} /> : null}
    </section>
  )
}

function OrganizationForm({ organization }: { organization: GetOrganization200 }) {
  const me = useMe()
  const canUpdate = me.permissions.includes('organization:update')
  const queryClient = useQueryClient()
  const rename = useRenameOrganization()
  const [notice, setNotice] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const form = useForm({
    resolver: zodResolver(brokerageNameSchema),
    defaultValues: { name: organization.name },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(undefined)
    setFailure(undefined)
    try {
      await rename.mutateAsync({ data: { name: values.name } })
      await queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey() })
      setNotice('Nome atualizado.')
    } catch (error) {
      if (error instanceof ApiError) setFailure(error.message)
      else setFailure('Não foi possível concluir. Tente de novo.')
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {notice && <FormAlert tone="info">{notice}</FormAlert>}
      {failure && <FormAlert>{failure}</FormAlert>}
      {canUpdate ? (
        <Field
          id="organization-name"
          label="Nome"
          error={errors.name?.message}
          {...form.register('name')}
        />
      ) : (
        <p>{organization.name}</p>
      )}
      <p>{organization.slug}</p>
      {canUpdate ? (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Salvar'}
        </Button>
      ) : null}
    </form>
  )
}
