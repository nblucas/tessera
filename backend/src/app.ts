import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import Fastify from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Deps } from './deps'
import { registerAuth } from './http/auth'
import { HttpError } from './http/errors'
import { authRoutes } from './http/routes/auth'
import { boardRoutes } from './http/routes/board'
import { eventRoutes } from './http/routes/events'
import { expenseRoutes } from './http/routes/expenses'
import { meRoutes } from './http/routes/me'
import { orderRoutes } from './http/routes/orders'
import { publicRoutes } from './http/routes/public'
import { LedgerRejection } from './ledger/types'

export function buildApp(deps: Deps, options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({ error: 'invalid_request', message: error.message })
    }
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: error.code, message: error.message })
    }
    if (error instanceof LedgerRejection) {
      return reply.status(409).send({ error: error.code, message: error.message })
    }
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500) {
      return reply.status(status).send({ error: 'bad_request', message: (error as Error).message })
    }
    request.log.error(error)
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong.' })
  })

  // Keeps the raw body for webhook signature checks.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, rawBody, done) => {
    const text = rawBody as string
    request.rawBody = text
    try {
      done(null, text.length > 0 ? JSON.parse(text) : {})
    } catch (error) {
      ;(error as { statusCode?: number }).statusCode = 400
      done(error as Error, undefined)
    }
  })

  app.register(cookie)
  app.register(multipart)
  app.register(swagger, {
    openapi: { info: { title: 'Tessera API', version: '0.1.0' } },
    transform: jsonSchemaTransform,
  })

  // Routes live in one plugin registered after swagger, so the OpenAPI document sees them.
  app.register(async (instance) => {
    const api = instance.withTypeProvider<ZodTypeProvider>()
    registerAuth(api, deps)
    authRoutes(api, deps)
    meRoutes(api, deps)
    eventRoutes(api, deps)
    orderRoutes(api, deps)
    expenseRoutes(api, deps)
    boardRoutes(api, deps)
    publicRoutes(api, deps)
    api.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())
  })

  return app
}

export type App = ReturnType<typeof buildApp>
