import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useGetSignupConfig } from '@/api/endpoints'
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

const CAPTCHA_CODES = new Set(['MISSING_RESPONSE', 'VERIFICATION_FAILED', 'UNKNOWN_ERROR'])

function Register() {
  const config = useGetSignupConfig()

  if (config.isPending) {
    return (
      <AuthCard title="Criar conta" description="Cadastre-se para usar a Bens Seguros.">
        <p className="text-muted-foreground text-sm">Carregando o cadastro…</p>
      </AuthCard>
    )
  }

  if (config.isError || !config.data) {
    return (
      <AuthCard title="Criar conta" description="Cadastre-se para usar a Bens Seguros.">
        <p className="text-sm">Não foi possível carregar o cadastro.</p>
        <Button type="button" variant="outline" onClick={() => config.refetch()}>
          Tentar de novo
        </Button>
      </AuthCard>
    )
  }

  if (config.data.signupMode === 'closed') {
    return (
      <AuthCard title="Criar conta">
        <p>O cadastro está fechado. Peça um convite à sua corretora.</p>
      </AuthCard>
    )
  }

  return <RegisterForm siteKey={config.data.turnstileSiteKey} />
}

function RegisterForm({ siteKey }: { siteKey: string | null }) {
  const navigate = useNavigate()
  const turnstile = useRef<TurnstileInstance>(undefined)
  const [token, setToken] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState
  const waitingForToken = siteKey !== null && token === undefined

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(undefined)
    const { error } = await authClient.signUp.email({
      ...values,
      callbackURL: '/login',
      fetchOptions: token ? { headers: { 'x-captcha-response': token } } : undefined,
    })
    if (error) {
      if (error.code && CAPTCHA_CODES.has(error.code)) {
        setToken(undefined)
        turnstile.current?.reset()
      }
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
        {siteKey && (
          <Turnstile
            ref={turnstile}
            siteKey={siteKey}
            className="flex justify-center"
            options={{ language: 'pt-br' }}
            onSuccess={setToken}
            onExpire={() => setToken(undefined)}
          />
        )}
        <Button type="submit" disabled={isSubmitting || waitingForToken}>
          {isSubmitting ? 'Aguarde…' : 'Criar conta'}
        </Button>
      </form>
    </AuthCard>
  )
}
