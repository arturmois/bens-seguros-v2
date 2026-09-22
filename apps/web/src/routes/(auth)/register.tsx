import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { redirectIfSignedIn } from '@/features/auth/guards'
import { registerSchema } from '@/features/auth/schemas'
import { authClient, authErrorMessage } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/register')({
  beforeLoad: ({ context }) => redirectIfSignedIn(context.queryClient),
  component: Register,
})

function Register() {
  const navigate = useNavigate()
  const [failure, setFailure] = useState<string>()
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(undefined)
    // The e-mail link lands on /login, which sends the now signed-in user to the app.
    const { error } = await authClient.signUp.email({ ...values, callbackURL: '/login' })
    if (error) {
      setFailure(authErrorMessage(error))
      return
    }
    await navigate({ to: '/verify-email', search: { email: values.email } })
  })

  return (
    <AuthCard
      title="Criar conta"
      description="Cadastre-se para usar a Bens Seguros."
      footer={
        <span className="text-muted-foreground">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary underline underline-offset-4">
            Entrar
          </Link>
        </span>
      }
    >
      {failure && <FormAlert>{failure}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="name"
          label="Nome"
          autoComplete="name"
          error={errors.name?.message}
          {...form.register('name')}
        />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Criar conta'}
        </Button>
      </form>
    </AuthCard>
  )
}
