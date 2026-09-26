import { z } from 'zod'
import type { Database } from '../../infrastructure/database.ts'
import { AppError } from '../../shared/errors.ts'
import { findPublicChat } from '../organizations/index.ts'

// Crawl/preview agents that must see brokerage branding without running the SPA (door 1).
export const PREVIEW_USER_AGENTS = [
  'WhatsApp',
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'Slackbot',
  'LinkedInBot',
  'TelegramBot',
] as const

export const openGraphParams = z.object({ key: z.string().regex(/^[0-9a-f]{32}$/) }).strict()

const unknownLink = new AppError(404, 'NOT_FOUND', 'Link de atendimento não encontrado.')

export function isPreviewUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return false
  const haystack = userAgent.toLowerCase()
  return PREVIEW_USER_AGENTS.some((token) => haystack.includes(token.toLowerCase()))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Absolute origin for og:image: prefer the request's public origin (behind Caddy).
export async function renderOpenGraphHtml(
  deps: { db: Database; config: { APP_URL: string } },
  key: string,
  options: { origin?: string } = {},
) {
  const chat = await findPublicChat(deps, key)
  if (!chat) throw unknownLink

  const origin = (options.origin ?? new URL(deps.config.APP_URL).origin).replace(/\/$/, '')
  const title = escapeHtml(chat.name)
  const description = escapeHtml((chat.greeting ?? 'Fale conosco pelo chat.').slice(0, 200))
  const image = chat.hasLogo ? `${origin}/api/public/chat/${key}/logo` : `${origin}/favicon.svg`

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:image" content="${escapeHtml(image)}"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary"/>
</head>
<body></body>
</html>`
}
