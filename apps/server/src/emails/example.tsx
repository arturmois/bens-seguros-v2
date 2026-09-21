import { Button, Text } from 'react-email'
import { colors, EmailLayout } from './layout.tsx'

type ExampleEmailProps = {
  name: string
  url: string
}

// Disposable (Phase 2): exercises the layout in the preview (`pnpm email:dev`) and in the e-mail test.
// Phase 3 replaces it with verify-email and reset-password.
export default function ExampleEmail({ name, url }: ExampleEmailProps) {
  return (
    <EmailLayout preview={`Olá, ${name}! Este é um e-mail de exemplo.`}>
      <Text style={{ fontSize: 16, marginTop: 0 }}>Olá, {name}!</Text>
      <Text>Este é um e-mail de exemplo, usado para validar o layout base.</Text>
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
        Abrir a Bens Seguros
      </Button>
    </EmailLayout>
  )
}

ExampleEmail.PreviewProps = {
  name: 'Maria',
  url: 'http://localhost:3000',
} satisfies ExampleEmailProps
