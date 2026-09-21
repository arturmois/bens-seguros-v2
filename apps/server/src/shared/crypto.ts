import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'
const IV_BYTES = 12
const KEY_BYTES = 32

// Keys arrive from config as base64 and must decode to 32 bytes (`openssl rand -base64 32`).
export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64')
  if (key.length !== KEY_BYTES) throw new RangeError(`Key must be ${KEY_BYTES} bytes (base64)`)
  return key
}

// AES-256-GCM with a random IV. Output: `v1.<iv>.<tag>.<ciphertext>` in base64url, versioned so a key
// rotation can tell old payloads apart.
export function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.')
}

// Throws when the payload was tampered with or encrypted with another key.
export function decrypt(key: Buffer, payload: string): string {
  const [version, iv, tag, ciphertext, ...rest] = payload.split('.')
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error('Malformed encrypted payload')
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

// Deterministic HMAC-SHA256 (hex) for lookups and unique indexes over encrypted values, such as
// `Client.documentHash`. Callers normalize the value first (digits only for CPF/CNPJ).
export function hmac(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex')
}
