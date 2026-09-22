import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/auth-card'
import { FormAlert } from '@/features/auth/components/form-alert'
import { authClient, authErrorMessage } from '@/lib/auth-client'

const searchSchema = z.object({ email: z.string().catch('') })

export const Route = createFileRoute('/(auth)/verify-email')({
  validateSearch: searchSchema,
  component: VerifyEmail,
})

type Result = { tone: 'info' | 'error'; message: string }

function VerifyEmail() {
  const { email } = Route.useSearch()
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result>()

  async function resend() {
    setSending(true)
    setResult(undefined)
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: '/login' })
    setSending(false)
    setResult(
      error
        ? { tone: 'error', message: authErrorMessage(error) }
        : { tone: 'info', message: 'E-mail reenviado.' },
    )
  }

  return (
    <AuthCard
      title="Confirme seu e-mail"
      description={`Enviamos um link de confirmação para ${email}.`}
      footer={
        <Link to="/login" className="text-muted-foreground underline underline-offset-4">
          Voltar para o login
        </Link>
      }
    >
      <p className="text-muted-foreground text-sm">
        Abra o link para ativar sua conta. Se não encontrar o e-mail, confira a caixa de spam.
      </p>
      {result && <FormAlert tone={result.tone}>{result.message}</FormAlert>}
      <Button variant="outline" onClick={resend} disabled={sending || email === ''}>
        {sending ? 'Aguarde…' : 'Reenviar e-mail'}
      </Button>
    </AuthCard>
  )
}
