import { Button, Text } from 'react-email'
import { colors, EmailLayout } from './layout.tsx'

export type ResetPasswordProps = {
  name: string
  url: string
}

export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Redefina a senha da sua conta na Bens Seguros.">
      <Text style={{ fontSize: 16, marginTop: 0 }}>{`Olá, ${name}!`}</Text>
      <Text>Recebemos um pedido para redefinir a senha da sua conta na Bens Seguros.</Text>
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
        Redefinir senha
      </Button>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        O link vale por 1 hora. Se você não pediu a redefinição, ignore este e-mail: sua senha
        continua a mesma.
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, wordBreak: 'break-all' }}>
        Se o botão não funcionar, copie e cole no navegador: {url}
      </Text>
    </EmailLayout>
  )
}

ResetPassword.PreviewProps = {
  name: 'Maria',
  url: 'http://localhost:3000/api/auth/reset-password/exemplo?callbackURL=%2Freset-password',
} satisfies ResetPasswordProps
