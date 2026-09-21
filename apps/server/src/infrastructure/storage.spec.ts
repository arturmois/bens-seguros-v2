import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testConfig } from '../../test/app.ts'
import { createStorage, type Storage } from './storage.ts'

let storage: Storage

beforeAll(async () => {
  storage = createStorage(testConfig())
  await storage.ensureBucket()
})

afterAll(() => storage.close())

describe('storage (MinIO)', () => {
  it('uploads, serves through a pre-signed attachment URL and deletes', async () => {
    const key = `org/${randomUUID()}/documents/${randomUUID()}/${randomUUID()}-apólice.pdf`
    const body = new TextEncoder().encode('%PDF-1.7 conteúdo de teste')

    await storage.put(key, body, 'application/pdf')
    const url = await storage.downloadUrl(key, 'apólice.pdf')
    const response = await fetch(url)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''ap%C3%B3lice.pdf",
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body)
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300')

    await storage.delete(key)
    expect((await fetch(await storage.downloadUrl(key, 'apólice.pdf'))).status).toBe(404)
  })
})
