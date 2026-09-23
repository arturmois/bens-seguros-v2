import { Button, Text } from 'react-email'
import { colors, EmailLayout } from './layout.tsx'

export type InvitationEmailProps = {
  organizationName: string
  url: string
}

export default function InvitationEmail({ organizationName, url }: InvitationEmailProps) {
  return (
    <EmailLayout preview={`Convite para ${organizationName}.`}>
      <Text style={{ fontSize: 16, marginTop: 0 }}>
        Você foi convidado para a corretora {organizationName}.
      </Text>
      <Text>Aceite o convite para entrar na equipe. O link vale por 7 dias.</Text>
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
        Aceitar convite
      </Button>
      <Text style={{ color: colors.muted, fontSize: 13, wordBreak: 'break-all' }}>
        Se o botão não funcionar, copie e cole no navegador: {url}
      </Text>
    </EmailLayout>
  )
}

InvitationEmail.PreviewProps = {
  organizationName: 'Corretora Azul',
  url: 'http://localhost:3000/accept-invitation?token=exemplo',
} satisfies InvitationEmailProps
