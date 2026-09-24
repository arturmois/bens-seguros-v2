import { randomBytes } from 'node:crypto'

// ADR-014: the key in the public Web Chat link resolves the tenant, so it is random, not derived
// from the name or the id. 32 lowercase hex characters.
export function newPublicChatKey(): string {
  return randomBytes(16).toString('hex')
}
