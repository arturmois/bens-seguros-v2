// Mutator used by every Orval-generated hook (src/api). Same origin: the session cookie goes along.

type ErrorBody = { error: { code: string; message: string; details?: unknown } }

// API failure in the server's `{ error: { code, message, details? } }` format. `message` is pt-BR and
// safe to show; `code` is stable for branching.
export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// Orval types the hooks' `error` with this.
export type ErrorType<_Error> = ApiError

function isErrorBody(body: unknown): body is ErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false
  const { error } = body
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

export async function http<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor.')
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  const body = isJson ? await response.json() : undefined

  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message, body.error.details)
    }
    throw new ApiError(response.status, 'HTTP_ERROR', 'Erro inesperado. Tente novamente.')
  }
  return body
}
