export type LogoType = 'image/png' | 'image/jpeg' | 'image/webp'

export const MAX_LOGO_BYTES = 200 * 1024

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

// The type comes from the file's own bytes, never from a name or a header the client sent. SVG is
// not accepted: it can carry script.
export function detectImageType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, PNG)) return 'image/png'
  if (startsWith(bytes, JPEG)) return 'image/jpeg'
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp'
  return null
}
