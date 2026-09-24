import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  getGetOrganizationLogoUrl,
  getGetOrganizationQueryKey,
  useGetOrganization,
  useRemoveOrganizationLogo,
  useRenameOrganization,
  useUpdateOrganizationBranding,
  useUploadOrganizationLogo,
} from '@/api/endpoints'
import type { GetOrganization200 } from '@/api/model'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { brandingSchema, webChatLink } from '@/features/organizations/branding'
import { brokerageNameSchema } from '@/features/organizations/name'
import { useMe } from '@/hooks/use-me'
import { ApiError } from '@/lib/http'

export const Route = createFileRoute('/_app/settings/organization')({
  component: OrganizationSettings,
})

function failureMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente de novo.'
}

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
      {organization.data ? (
        <>
          <OrganizationForm organization={organization.data} />
          <WebChatLink publicChatKey={organization.data.publicChatKey} />
          <BrandingForm organization={organization.data} />
          <LogoSection logoUpdatedAt={organization.data.logoUpdatedAt} />
        </>
      ) : null}
    </section>
  )
}

function useCanUpdate() {
  return useMe().permissions.includes('organization:update')
}

function OrganizationForm({ organization }: { organization: GetOrganization200 }) {
  const canUpdate = useCanUpdate()
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
      setFailure(failureMessage(error))
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

function WebChatLink({ publicChatKey }: { publicChatKey: string }) {
  const link = webChatLink(window.location.origin, publicChatKey)
  const [notice, setNotice] = useState<string>()
  const [failure, setFailure] = useState<string>()

  async function copy() {
    setNotice(undefined)
    setFailure(undefined)
    try {
      await navigator.clipboard.writeText(link)
      setNotice('Link copiado.')
    } catch {
      setFailure('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold text-lg">Web Chat</h2>
      <p className="text-muted-foreground text-sm">
        Envie este link aos seus clientes para falarem com a corretora.
      </p>
      {notice && <FormAlert tone="info">{notice}</FormAlert>}
      {failure && <FormAlert>{failure}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <code className="break-all" data-testid="web-chat-link">
          {link}
        </code>
        <Button type="button" variant="outline" onClick={copy}>
          Copiar
        </Button>
      </div>
    </div>
  )
}

function BrandingForm({ organization }: { organization: GetOrganization200 }) {
  const canUpdate = useCanUpdate()
  const queryClient = useQueryClient()
  const update = useUpdateOrganizationBranding()
  const [notice, setNotice] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const form = useForm({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      brandColor: organization.brandColor ?? '',
      greeting: organization.greeting ?? '',
    },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(undefined)
    setFailure(undefined)
    try {
      await update.mutateAsync({
        data: { brandColor: values.brandColor || null, greeting: values.greeting || null },
      })
      await queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey() })
      setNotice('Identidade visual atualizada.')
    } catch (error) {
      setFailure(failureMessage(error))
    }
  })

  if (!canUpdate) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Identidade visual</h2>
        <p>Cor: {organization.brandColor ?? 'padrão'}</p>
        <p>Saudação: {organization.greeting ?? 'padrão'}</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">Identidade visual</h2>
      {notice && <FormAlert tone="info">{notice}</FormAlert>}
      {failure && <FormAlert>{failure}</FormAlert>}
      <Field
        id="brand-color"
        label="Cor"
        placeholder="#1a2b3c"
        error={errors.brandColor?.message}
        {...form.register('brandColor')}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="greeting">Saudação</Label>
        <textarea
          id="greeting"
          rows={3}
          className="rounded-md border px-3 py-2 text-sm"
          aria-invalid={errors.greeting ? true : undefined}
          aria-describedby={errors.greeting ? 'greeting-error' : undefined}
          {...form.register('greeting')}
        />
        {errors.greeting && (
          <p id="greeting-error" className="text-destructive text-sm">
            {errors.greeting.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Aguarde…' : 'Atualizar identidade visual'}
      </Button>
    </form>
  )
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function LogoSection({ logoUpdatedAt }: { logoUpdatedAt: string | null }) {
  const canUpdate = useCanUpdate()
  const queryClient = useQueryClient()
  const upload = useUploadOrganizationLogo()
  const remove = useRemoveOrganizationLogo()
  const [notice, setNotice] = useState<string>()
  const [failure, setFailure] = useState<string>()

  async function run(action: () => Promise<unknown>, done: string) {
    setNotice(undefined)
    setFailure(undefined)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: getGetOrganizationQueryKey() })
      setNotice(done)
    } catch (error) {
      setFailure(failureMessage(error))
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await run(
      async () => upload.mutateAsync({ data: { image: await readAsBase64(file) } }),
      'Logo atualizado.',
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold text-lg">Logo</h2>
      {notice && <FormAlert tone="info">{notice}</FormAlert>}
      {failure && <FormAlert>{failure}</FormAlert>}
      {logoUpdatedAt ? (
        <img
          src={`${getGetOrganizationLogoUrl()}?v=${encodeURIComponent(logoUpdatedAt)}`}
          alt="Logo da corretora"
          className="h-20 w-auto self-start rounded border"
        />
      ) : (
        <p>Nenhum logo enviado.</p>
      )}
      {canUpdate ? (
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="logo-file">Enviar logo (PNG, JPEG ou WebP, até 200 KB)</Label>
          <input
            id="logo-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFile}
          />
          {logoUpdatedAt ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => run(() => remove.mutateAsync(), 'Logo removido.')}
            >
              Remover logo
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
