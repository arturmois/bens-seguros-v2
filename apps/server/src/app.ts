import { randomUUID } from 'node:crypto'
import fastifySwagger from '@fastify/swagger'
import Fastify, { LogController } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Deps } from './dependencies.ts'
import { createRealtime } from './infrastructure/realtime.ts'
import { exampleRoutes } from './modules/examples/index.ts'
import { errorHandler, notFoundHandler } from './shared/errors.ts'

z.config(z.locales.ptBR())

const healthOutput = z.object({ status: z.literal('ok') })

export function buildApp(deps: Deps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  // Collects every route schema; scripts/export-openapi.ts writes it for Orval (ADR-007).
  app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Bens Seguros API', version: '1.0.0' },
    },
    transform: jsonSchemaTransform,
  })

  const realtime = createRealtime(app.server)
  app.addHook('preClose', async () => {
    await realtime.close()
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  // Routes go through `register` so @fastify/swagger (loaded first) sees them.
  app.register(async (api) => {
    api.get(
      '/api/health',
      {
        schema: { response: { 200: healthOutput }, tags: ['Health'], operationId: 'getHealth' },
      },
      async () => ({ status: 'ok' as const }),
    )
  })
  app.register(exampleRoutes)

  return app
}

export type App = ReturnType<typeof buildApp>
