import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Deps } from './deps'
import { registerAuth } from './http/auth'
import { HttpError } from './http/errors'
import { authRoutes } from './http/routes/auth'
import { eventRoutes } from './http/routes/events'
import { expenseRoutes } from './http/routes/expenses'
import { meRoutes } from './http/routes/me'
import { orderRoutes } from './http/routes/orders'
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
  registerAuth(app, deps)
  authRoutes(app, deps)
  meRoutes(app, deps)
  eventRoutes(app, deps)
  orderRoutes(app, deps)
  expenseRoutes(app, deps)

  return app
}

export type App = ReturnType<typeof buildApp>
