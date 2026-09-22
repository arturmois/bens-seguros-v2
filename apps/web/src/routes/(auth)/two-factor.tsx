import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { codeSchema } from '@/features/auth/schemas'
import { authClient, authErrorMessage, safeRedirect } from '@/lib/auth-client'

const searchSchema = z.object({ redirect: z.string().optional().catch(undefined) })

export const Route = createFileRoute('/(auth)/two-factor')({
  validateSearch: searchSchema,
  component: TwoFactor,
})

// Second step of the sign-in of a user with 2FA: the pending sign-in lives in Better Auth's cookie.
function TwoFactor() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [failure, setFailure] = useState<string>()
  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ code }) => {
    setFailure(undefined)
    const { error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code })
    if (error) {
      setFailure(authErrorMessage(error))
      return
    }
    queryClient.removeQueries()
    await navigate({ href: safeRedirect(search.redirect) })
  })

  return (
    <AuthCard
      title="Verificação em duas etapas"
      description={
        useBackupCode
          ? 'Informe um dos seus códigos de backup.'
          : 'Informe o código de 6 dígitos do seu aplicativo autenticador.'
      }
      footer={
        <Link to="/login" className="text-muted-foreground underline underline-offset-4">
          Voltar para o login
        </Link>
      }
    >
      {failure && <FormAlert>{failure}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="code"
          label={useBackupCode ? 'Código de backup' : 'Código'}
          autoComplete="one-time-code"
          inputMode={useBackupCode ? 'text' : 'numeric'}
          error={errors.code?.message}
          {...form.register('code')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Verificar'}
        </Button>
      </form>
      <Button
        variant="link"
        onClick={() => {
          setUseBackupCode((current) => !current)
          setFailure(undefined)
          form.reset()
        }}
      >
        {useBackupCode ? 'Usar o aplicativo autenticador' : 'Usar código de backup'}
      </Button>
    </AuthCard>
  )
}
