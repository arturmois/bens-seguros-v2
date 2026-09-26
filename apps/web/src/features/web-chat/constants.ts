export const WEB_CHAT_NOTICE_VERSION = '2026-09-25'

// Provisional notice text (F11 will replace after legal review). Version must match the API.
export const WEB_CHAT_NOTICE_TEXT =
  'Ao continuar, você concorda em conversar com esta corretora pelo chat e em que suas mensagens sejam usadas para o atendimento. Não envie dados sensíveis desnecessários.'

export function visitorTokenStorageKey(publicChatKey: string) {
  return `bens_visitor_token:${publicChatKey}`
}

export function readStoredVisitorToken(publicChatKey: string) {
  try {
    return sessionStorage.getItem(visitorTokenStorageKey(publicChatKey))
  } catch {
    return null
  }
}

export function storeVisitorToken(publicChatKey: string, token: string) {
  try {
    sessionStorage.setItem(visitorTokenStorageKey(publicChatKey), token)
  } catch {
    // Private mode or quota: the HttpOnly cookie still covers REST; the socket needs the token.
  }
}

export const PUBLIC_CHAT_KEY = /^[0-9a-f]{32}$/
