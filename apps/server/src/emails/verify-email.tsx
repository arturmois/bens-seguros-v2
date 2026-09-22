import { Button, Text } from 'react-email'
import { colors, EmailLayout } from './layout.tsx'

export type VerifyEmailProps = {
  name: string
  url: string
}

export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Confirme seu e-mail para começar a usar a Bens Seguros.">
      <Text style={{ fontSize: 16, marginTop: 0 }}>{`Olá, ${name}!`}</Text>
      <Text>Confirme seu e-mail para ativar sua conta na Bens Seguros.</Text>
      <Button
        href={url}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 6,
          color: '#ffffff',
          fontWeight: 600,
          padding: '12px 20px',
        }}
      >
        Confirmar e-mail
      </Button>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, wordBreak: 'break-all' }}>
        Se o botão não funcionar, copie e cole no navegador: {url}
      </Text>
    </EmailLayout>
  )
}

VerifyEmail.PreviewProps = {
  name: 'Maria',
  url: 'http://localhost:3000/api/auth/verify-email?token=exemplo',
} satisfies VerifyEmailProps
