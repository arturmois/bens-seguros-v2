import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import QRCode from 'react-qr-code'
import { getGetMeQueryKey } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { codeSchema, passwordSchema } from '@/features/auth/schemas'
import { useMe } from '@/hooks/use-me'
import { authClient, authErrorMessage } from '@/lib/auth-client'

export const Route = createFileRoute('/_app/settings/security')({
  component: Security,
})

type Enrollment = { totpURI: string; backupCodes: string[] }
type Notice = { tone: 'info' | 'error'; message: string }

function Security() {
  const me = useMe()
  const queryClient = useQueryClient()
  const [enrollment, setEnrollment] = useState<Enrollment>()
  const [notice, setNotice] = useState<Notice>()
  const refreshMe = () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">Segurança</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Verificação em duas etapas</h2>
          </CardTitle>
          <CardDescription>
            {me.twoFactorEnabled
              ? 'Ativa: o login pede um código do seu aplicativo autenticador.'
              : 'Proteja sua conta pedindo um código do aplicativo autenticador no login.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {notice && <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
          {me.twoFactorEnabled ? (
            <PasswordForm
              action="Desativar"
              destructive
              onSubmit={async (password) => {
                const { error } = await authClient.twoFactor.disable({ password })
                if (error) return setNotice({ tone: 'error', message: authErrorMessage(error) })
                setNotice({ tone: 'info', message: 'Verificação em duas etapas desativada.' })
                await refreshMe()
              }}
            />
          ) : enrollment ? (
            <ConfirmEnrollment
              enrollment={enrollment}
              onConfirmed={async () => {
                setEnrollment(undefined)
                setNotice({ tone: 'info', message: 'Verificação em duas etapas ativada.' })
                await refreshMe()
              }}
            />
          ) : (
            <PasswordForm
              action="Ativar verificação em duas etapas"
              onSubmit={async (password) => {
                setNotice(undefined)
                const { data, error } = await authClient.twoFactor.enable({ password })
                if (error) return setNotice({ tone: 'error', message: authErrorMessage(error) })
                if (data.method !== 'totp') return
                setEnrollment({ totpURI: data.totpURI, backupCodes: data.backupCodes })
              }}
            />
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function PasswordForm({
  action,
  destructive = false,
  onSubmit,
}: {
  action: string
  destructive?: boolean
  onSubmit: (password: string) => Promise<unknown>
}) {
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: '' } })
  const { errors, isSubmitting } = form.formState
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(async ({ password }) => {
        await onSubmit(password)
        form.reset()
      })}
    >
      <Field
        id="password"
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register('password')}
      />
      <Button
        type="submit"
        variant={destructive ? 'destructive' : 'default'}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Aguarde…' : action}
      </Button>
    </form>
  )
}

function ConfirmEnrollment({
  enrollment,
  onConfirmed,
}: {
  enrollment: Enrollment
  onConfirmed: () => Promise<void>
}) {
  const [failure, setFailure] = useState<string>()
  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } })
  const { errors, isSubmitting } = form.formState
  const secret = new URL(enrollment.totpURI).searchParams.get('secret') ?? ''

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Escaneie o QR code no seu aplicativo autenticador ou digite a chave manualmente.
      </p>
      <div className="self-center rounded-lg bg-white p-3">
        <QRCode value={enrollment.totpURI} size={176} aria-label="QR code do autenticador" />
      </div>
      <p className="text-sm">
        Chave:{' '}
        <code className="break-all font-mono" data-testid="totp-secret">
          {secret}
        </code>
      </p>
      <div className="flex flex-col gap-2 text-sm">
        <p>Guarde estes códigos de backup. Cada um vale uma vez, se você perder o aplicativo:</p>
        <ul className="grid grid-cols-2 gap-1 font-mono" data-testid="backup-codes">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
      {failure && <FormAlert>{failure}</FormAlert>}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async ({ code }) => {
          setFailure(undefined)
          const { error } = await authClient.twoFactor.verifyTotp({ code })
          if (error) return setFailure(authErrorMessage(error))
          await onConfirmed()
        })}
      >
        <Field
          id="code"
          label="Código de 6 dígitos"
          autoComplete="one-time-code"
          inputMode="numeric"
          error={errors.code?.message}
          {...form.register('code')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Aguarde…' : 'Confirmar'}
        </Button>
      </form>
    </div>
  )
}
