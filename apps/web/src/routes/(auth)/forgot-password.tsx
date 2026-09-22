import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { forgotPasswordSchema } from '@/features/auth/schemas'
import { authClient, authErrorMessage } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/forgot-password')({
  component: ForgotPassword,
})

type Result = { tone: 'info' | 'error'; message: string }

function ForgotPassword() {
  const [result, setResult] = useState<Result>()
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(undefined)
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: '/reset-password',
    })
    // The same answer whether or not the e-mail has an account.
    setResult(
      error
        ? { tone: 'error', message: authErrorMessage(error) }
        : {
            tone: 'info',
            message:
              'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.',
          },
    )
  })

  return (
    <AuthCard
      title="Esqueci minha senha"
      description="Informe seu e-mail para receber um link de redefinição."
      footer={
        <Link to="/login" className="text-muted-foreground underline underline-offset-4">
          Voltar para o login
        </Link>
      }
    >
      {result && <FormAlert tone={result.tone}>{result.message}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          id="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Enviar link'}
        </Button>
      </form>
    </AuthCard>
  )
}
