import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { resetPasswordSchema } from '@/features/auth/schemas'
import { authClient, authErrorMessage } from '@/lib/auth-client'

// Better Auth's link redirects here with ?token=… or, when the token is bad, ?error=INVALID_TOKEN.
const searchSchema = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/(auth)/reset-password')({
  validateSearch: searchSchema,
  component: ResetPassword,
})

function InvalidLink() {
  return (
    <FormAlert>
      Link inválido ou expirado.{' '}
      <Link to="/forgot-password" className="underline underline-offset-4">
        Pedir um novo link
      </Link>
    </FormAlert>
  )
}

function ResetPassword() {
  const { token, error } = Route.useSearch()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<{ invalidLink: boolean; message: string }>()
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(undefined)
    const result = await authClient.resetPassword({
      newPassword: values.password,
      token: token ?? '',
    })
    if (result.error) {
      const invalidLink =
        result.error.code === 'INVALID_TOKEN' || result.error.code === 'TOKEN_EXPIRED'
      setFailure({ invalidLink, message: authErrorMessage(result.error) })
      return
    }
    await navigate({ to: '/login', search: { reset: true } })
  })

  if (error || !token) {
    return (
      <AuthCard title="Redefinir senha">
        <InvalidLink />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Redefinir senha" description="Escolha uma nova senha para sua conta.">
      {failure &&
        (failure.invalidLink ? <InvalidLink /> : <FormAlert>{failure.message}</FormAlert>)}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Field
          id="confirmation"
          label="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirmation?.message}
          {...form.register('confirmation')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Redefinir senha'}
        </Button>
      </form>
    </AuthCard>
  )
}
