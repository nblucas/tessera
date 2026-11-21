import { demoPrivateKey } from '@tessera/shared'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { afterAll, describe, expect, it } from 'vitest'
import { body, createTestApp } from './app'

const t = await createTestApp()
afterAll(() => t.close())

async function requestCode(email: string) {
  const response = await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email } })
  expect(response.statusCode).toBe(204)
  return t.mailer.lastCodeFor(email)
}

function createSession(email: string, code: string) {
  return t.app.inject({ method: 'POST', url: '/auth/session', payload: { email, code } })
}

describe('sign-in', () => {
  it('signs in with the code sent by e-mail', async () => {
    const code = await requestCode('ana@student.edu')
    expect(code).toMatch(/^\d{6}$/)

    const response = await createSession('ana@student.edu', code)
    expect(response.statusCode).toBe(200)
    const cookie = response.cookies.find((item) => item.name === 'tessera_session')
    expect(cookie?.httpOnly).toBe(true)

    const me = await t.app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `tessera_session=${cookie!.value}` },
    })
    expect(body(me)).toMatchObject({ email: 'ana@student.edu', address: null, isBoardMember: false })
  })

  it('normalizes the e-mail address', async () => {
    await t.app.inject({ method: 'POST', url: '/auth/code', payload: { email: 'Bia@Student.EDU ' } })
    const code = t.mailer.lastCodeFor('bia@student.edu')
    const response = await createSession('bia@student.edu', code)
    expect(body(response)).toMatchObject({ email: 'bia@student.edu' })
  })

  it('rejects a wrong code', async () => {
    await requestCode('caio@student.edu')
    const response = await createSession('caio@student.edu', '000000')
    expect(response.statusCode).toBe(400)
  })

  it('stops accepting codes after 5 wrong attempts', async () => {
    const code = await requestCode('duda@student.edu')
    for (let i = 0; i < 5; i++) await createSession('duda@student.edu', code === '111111' ? '222222' : '111111')

    const response = await createSession('duda@student.edu', code)
    expect(response.statusCode).toBe(429)
  })

  it('rejects an expired code', async () => {
    const code = await requestCode('enzo@student.edu')
    t.clock.now = new Date(t.clock.now.getTime() + 11 * 60_000)
    try {
      expect((await createSession('enzo@student.edu', code)).statusCode).toBe(400)
    } finally {
      t.clock.now = new Date()
    }
  })

  it('accepts a code only once', async () => {
    const code = await requestCode('fabi@student.edu')
    expect((await createSession('fabi@student.edu', code)).statusCode).toBe(200)
    expect((await createSession('fabi@student.edu', code)).statusCode).toBe(400)
  })

  it('requires a session for /me', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401)
  })

  it('signs out', async () => {
    const user = await t.signIn('gabi@student.edu')
    expect((await user.delete('/auth/session')).statusCode).toBe(204)
    expect((await user.get('/me')).statusCode).toBe(401)
  })

  it('recognizes the seed directors as the board', async () => {
    const diego = await t.signIn('diego@demo.com')
    const expected = privateKeyToAccount(demoPrivateKey('diego@demo.com')).address

    expect(body(await diego.get('/me'))).toMatchObject({
      name: 'Diego Ramos',
      address: expected,
      isBoardMember: true,
    })
  })
})

describe('sign-in in demo mode', () => {
  it('accepts any 6-digit code without sending one', async () => {
    const demo = await createTestApp({ demoMode: true })
    try {
      const response = await demo.app.inject({
        method: 'POST',
        url: '/auth/session',
        payload: { email: 'hugo@student.edu', code: '000000' },
      })
      expect(response.statusCode).toBe(200)
    } finally {
      await demo.close()
    }
  })
})

describe('wallet address', () => {
  it('registers an address by signing a challenge', async () => {
    const user = await t.signIn('iris@student.edu')
    expect((await user.registerAddress()).statusCode).toBe(200)

    expect(body(await user.get('/me'))).toMatchObject({ address: user.wallet.address })
    expect(body(await user.get('/me/nonce'))).toEqual({ nonce: 0 })
  })

  it('rejects a challenge signed with another key', async () => {
    const user = await t.signIn('joao@student.edu')
    const { challenge } = body<{ challenge: string }>(await user.post('/me/address/challenge'))
    const other = privateKeyToAccount(generatePrivateKey())
    const signature = await other.signMessage({ message: challenge })

    const response = await user.post('/me/address', { address: user.wallet.address, signature })
    expect(response.statusCode).toBe(400)
  })

  it('keeps one address per account', async () => {
    const user = await t.signIn('kaka@student.edu')
    await user.registerAddress()
    expect((await user.registerAddress()).statusCode).toBe(409)
  })

  it('gives an address to one account only', async () => {
    const first = await t.signIn('lia@student.edu')
    await first.registerAddress()
    const second = await t.signIn('lucas@student.edu')

    const { challenge } = body<{ challenge: string }>(await second.post('/me/address/challenge'))
    const signature = await first.wallet.signMessage({ message: challenge })
    const response = await second.post('/me/address', { address: first.wallet.address, signature })
    expect(response.statusCode).toBe(409)
  })
})

describe('deleting personal data', () => {
  it('erases the e-mail and ends the session', async () => {
    const user = await t.signIn('maria@student.edu')
    await user.registerAddress()

    expect((await user.delete('/me')).statusCode).toBe(204)
    expect((await user.get('/me')).statusCode).toBe(401)

    const again = await t.signIn('maria@student.edu')
    expect(body(await again.get('/me'))).toMatchObject({ email: 'maria@student.edu', address: null })
  })

  it('is refused while the account is on the board', async () => {
    const elisa = await t.signIn('elisa@demo.com')
    expect((await elisa.delete('/me')).statusCode).toBe(409)
  })
})
