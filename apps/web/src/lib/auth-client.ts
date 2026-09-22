import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// The only door to /api/auth (ADR-003): login, sign-up, e-mail, password reset and 2FA screens.
// Same origin, so no baseURL. Everything else about the user comes from GET /api/v1/me.
export const authClient = createAuthClient({ plugins: [twoFactorClient()] })

type AuthError = { status: number; code?: string | undefined }

// Only the codes a screen can receive: the password length is checked by the form first, and the
// reset screen shows its own text for a bad link.
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para entrar.',
  INVALID_CODE: 'Código inválido.',
  INVALID_BACKUP_CODE: 'Código inválido.',
  INVALID_PASSWORD: 'Senha incorreta.',
  ACCOUNT_TEMPORARILY_LOCKED: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  SIGNUP_CLOSED: 'O cadastro está fechado. Peça um convite à sua corretora.',
  EMAIL_DOMAIN_NOT_ALLOWED:
    'E-mails descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.',
  MISSING_RESPONSE: 'Não foi possível confirmar que você não é um robô. Tente de novo.',
  VERIFICATION_FAILED: 'Não foi possível confirmar que você não é um robô. Tente de novo.',
  UNKNOWN_ERROR: 'Não foi possível confirmar que você não é um robô. Tente de novo.',
}

// Better Auth answers in English with a stable `code`; the screens show pt-BR.
export function authErrorMessage(error: AuthError) {
  if (error.status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  return (error.code && MESSAGES[error.code]) || 'Não foi possível concluir. Tente de novo.'
}

// Where to go after signing in: only a path of this app, never another origin.
export function safeRedirect(value: string | undefined) {
  if (value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value
  return '/dashboard'
}
