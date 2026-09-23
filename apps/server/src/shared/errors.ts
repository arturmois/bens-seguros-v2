import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { Prisma } from '../generated/prisma/client.ts'

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown }
}

// Expected failure with a stable `code` and a user-facing pt-BR `message`.
export class AppError extends Error {
  override name = 'AppError'
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

// Unique constraint violation (P2002), for a use case that turns it into its own AppError or a retry.
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function body(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } }
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const issues = error.validation.map((issue) => ({
      path: issue.instancePath,
      message: issue.message,
    }))
    return reply.status(400).send(body('VALIDATION_ERROR', 'Dados inválidos.', issues))
  }

  if (error instanceof AppError) {
    return reply.status(error.status).send(body(error.code, error.message, error.details))
  }

  // Unique constraint violation that the use case did not turn into a friendlier AppError.
  if (isUniqueViolation(error)) {
    request.log.info({ err: error }, 'unique constraint violation')
    return reply.status(409).send(body('CONFLICT', 'Registro já existe.'))
  }

  // Client errors raised by Fastify itself (malformed JSON, unsupported media type, body too large).
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    request.log.info({ err: error }, 'request rejected')
    return reply.status(error.statusCode).send(body('BAD_REQUEST', 'Requisição inválida.'))
  }

  request.log.error({ err: error }, 'unhandled error')
  return reply
    .status(500)
    .send(body('INTERNAL_ERROR', 'Erro interno do servidor.', { requestId: request.id }))
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send(body('NOT_FOUND', 'Recurso não encontrado.'))
}
