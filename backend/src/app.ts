import cookie from '@fastify/cookie'
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
import { meRoutes } from './http/routes/me'
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

  app.register(cookie)
  registerAuth(app, deps)
  authRoutes(app, deps)
  meRoutes(app, deps)

  return app
}

export type App = ReturnType<typeof buildApp>
