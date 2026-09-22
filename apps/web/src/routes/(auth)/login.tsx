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
import { redirectIfSignedIn } from '@/features/auth/guards'
import { loginSchema } from '@/features/auth/schemas'
import { authClient, authErrorMessage, safeRedirect } from '@/lib/auth-client'

const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
  // Set by Better Auth when an e-mail link is invalid or expired.
  error: z.string().optional().catch(undefined),
  reset: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/(auth)/login')({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  component: Login,
})

type Failure = { message: string; unverifiedEmail?: string }

function Login() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [failure, setFailure] = useState<Failure>()
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(undefined)
    const { data, error } = await authClient.signIn.email(values)
    if (error) {
      setFailure({
        message: authErrorMessage(error),
        ...(error.code === 'EMAIL_NOT_VERIFIED' && { unverifiedEmail: values.email }),
      })
      return
    }
    if ('twoFactorRedirect' in data && data.twoFactorRedirect) {
      await navigate({ to: '/two-factor', search: { redirect: search.redirect } })
      return
    }
    queryClient.removeQueries()
    await navigate({ href: safeRedirect(search.redirect) })
  })

  return (
    <AuthCard
      title="Entrar"
      description="Acesse sua conta da Bens Seguros."
      footer={
        <>
          <Link
            to="/forgot-password"
            className="text-muted-foreground underline underline-offset-4"
          >
            Esqueci minha senha
          </Link>
          <span className="text-muted-foreground">
            Não tem conta?{' '}
            <Link to="/register" className="text-primary underline underline-offset-4">
              Criar conta
            </Link>
          </span>
        </>
      }
    >
      {search.error && !failure && (
        <FormAlert>Link inválido ou expirado. Faça login para receber outro.</FormAlert>
      )}
      {search.reset && !failure && (
        <FormAlert tone="info">Senha redefinida. Entre com a nova senha.</FormAlert>
      )}
      {failure && (
        <FormAlert>
          {failure.message}
          {failure.unverifiedEmail && (
            <>
              {' '}
              <Link
                to="/verify-email"
                search={{ email: failure.unverifiedEmail }}
                className="underline underline-offset-4"
              >
                Reenviar o e-mail de confirmação
              </Link>
            </>
          )}
        </FormAlert>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <Field
          id="password"
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Entrar'}
        </Button>
      </form>
    </AuthCard>
  )
}
