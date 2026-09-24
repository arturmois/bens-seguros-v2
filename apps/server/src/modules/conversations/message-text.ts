import { AppError } from '../../shared/errors.ts'

// The widest channel's limit (WhatsApp); a channel's own edge may be narrower.
export const MAX_TEXT_LENGTH = 65_536

export const invalidMessage = new AppError(422, 'INVALID_MESSAGE', 'Mensagem inválida.')

export function checkedText(text: string | null | undefined): string {
  if (text === null || text === undefined || text.trim() === '' || text.length > MAX_TEXT_LENGTH) {
    throw invalidMessage
  }
  return text
}
