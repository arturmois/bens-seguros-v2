import { describe, expect, it } from 'vitest'
import { detectImageType } from './logo.ts'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]
const WEBP = [...Buffer.from('RIFF'), 0x24, 0x00, 0x00, 0x00, ...Buffer.from('WEBPVP8 ')]
const RIFF_WAVE = [...Buffer.from('RIFF'), 0x24, 0x00, 0x00, 0x00, ...Buffer.from('WAVEfmt ')]
const GIF = [...Buffer.from('GIF89a'), 0x01, 0x00, 0x01, 0x00]
const SVG = [...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]
const TEXT = [...Buffer.from('não é uma imagem')]

describe('detectImageType', () => {
  it('detects the image type from magic bytes', () => {
    const cases: [string, number[], string | null][] = [
      ['png', PNG, 'image/png'],
      ['jpeg', JPEG, 'image/jpeg'],
      ['webp', WEBP, 'image/webp'],
      ['svg', SVG, null],
      ['gif', GIF, null],
      ['text', TEXT, null],
      ['riff without webp', RIFF_WAVE, null],
      ['empty', [], null],
    ]

    for (const [label, bytes, expected] of cases) {
      expect(detectImageType(Uint8Array.from(bytes)), label).toBe(expected)
    }
  })
})
