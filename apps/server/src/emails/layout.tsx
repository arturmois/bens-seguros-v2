import type { ReactNode } from 'react'
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email'

// Brand tokens from the web app (legacy design): teal primary, gold accent.
export const colors = {
  primary: '#1f4b5f',
  accent: '#b98927',
  text: '#1f2933',
  muted: '#6b7280',
  background: '#f4f6f8',
  card: '#ffffff',
} as const

const fontFamily = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

type EmailLayoutProps = {
  // Inbox preview line.
  preview: string
  children: ReactNode
}

// Shell shared by every transactional e-mail: header, card with the content and the footer.
export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: colors.background, fontFamily, margin: 0, padding: '24px 0' }}
      >
        <Container style={{ maxWidth: 560, margin: '0 auto' }}>
          <Section style={{ padding: '0 24px 16px' }}>
            <Text style={{ color: colors.primary, fontSize: 20, fontWeight: 700, margin: 0 }}>
              Bens Seguros
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: colors.card,
              borderRadius: 8,
              borderTop: `4px solid ${colors.accent}`,
              color: colors.text,
              padding: 24,
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: 'transparent', margin: '8px 0' }} />
          <Text style={{ color: colors.muted, fontSize: 12, padding: '0 24px', margin: 0 }}>
            Você recebeu este e-mail porque tem uma conta na Bens Seguros. Não responda: esta caixa
            não é monitorada.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
