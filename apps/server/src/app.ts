import { randomUUID } from 'node:crypto'
import Fastify, { LogController } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Deps } from './dependencies.ts'
import { errorHandler, notFoundHandler } from './shared/errors.ts'
import { loggerOptions } from './shared/logger.ts'

z.config(z.locales.ptBR())

const healthOutput = z.object({ status: z.literal('ok') })

export function buildApp(deps: Deps) {
  const app = Fastify({
    logger: loggerOptions(deps.config),
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  app.get(
    '/api/health',
    {
      schema: { response: { 200: healthOutput }, tags: ['Health'], operationId: 'getHealth' },
    },
    async () => ({ status: 'ok' as const }),
  )

  return app
}

export type App = ReturnType<typeof buildApp>
