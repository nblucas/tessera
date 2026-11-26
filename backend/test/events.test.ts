import { afterAll, describe, expect, it } from 'vitest'
import { body, createTestApp } from './app'

const t = await createTestApp()
afterAll(() => t.close())

const student = await t.signIn('student@demo.com')
const diego = await t.signIn('diego@demo.com')

type EventBody = {
  id: string
  title: string
  date: string
  batches: { id: string; name: string; priceCents: number; quantity: number; available: number }[]
}

async function createEvent() {
  const response = await diego.post('/events', {
    title: 'Spring Party',
    description: 'Outdoor party.',
    date: '2027-03-10T22:00:00-03:00',
    location: 'Campus lawn',
    color: '#51b8aa',
  })
  expect(response.statusCode).toBe(201)
  return body<EventBody>(response)
}

describe('events', () => {
  it('lists events by date with their batches and availability', async () => {
    const events = body<EventBody[]>(await student.get('/events'))

    expect(events.map((event) => event.id).slice(0, 4)).toEqual([
      'halloween-night',
      'end-of-year-party',
      'freshers-welcome',
      'interuniversity-games',
    ])
    const party = events.find((event) => event.id === 'end-of-year-party')!
    expect(party.batches).toEqual([
      expect.objectContaining({ id: 'b1', name: '1st batch', priceCents: 4000, available: 0 }),
      expect.objectContaining({ id: 'b2', name: '2nd batch', priceCents: 5500, available: 86 }),
      expect.objectContaining({ id: 'b3', name: '3rd batch', priceCents: 7000, available: 200 }),
    ])
  })

  it('shows one event', async () => {
    const response = await student.get('/events/freshers-welcome')
    expect(body<EventBody>(response).title).toBe('Freshers Welcome 2027')
    expect((await student.get('/events/nope')).statusCode).toBe(404)
  })

  it('requires sign-in', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/events' })).statusCode).toBe(401)
  })

  it('lets a director create an event and add batches', async () => {
    const event = await createEvent()
    expect(event.id).toMatch(/^spring-party-[0-9a-f]{4}$/)

    const action = await diego.sign('BatchCreated', {
      eventId: event.id,
      batchId: 'b1',
      priceCents: 3000,
      quantity: 100, resaleCapPercent: 120,
    })
    const response = await diego.post(`/events/${event.id}/batches`, {
      changes: [{ batchId: 'b1', name: 'Early bird', action }],
    })
    expect(response.statusCode).toBe(200)

    const seen = body<EventBody>(await student.get(`/events/${event.id}`))
    expect(seen.batches).toEqual([
      expect.objectContaining({ id: 'b1', name: 'Early bird', priceCents: 3000, available: 100 }),
    ])
  })

  it('edits event details', async () => {
    const event = await createEvent()
    const response = await diego.patch(`/events/${event.id}`, { title: 'Spring Party 2027' })
    expect(body<EventBody>(response).title).toBe('Spring Party 2027')
  })

  it('keeps event management to the board', async () => {
    const response = await student.post('/events', {
      title: 'Fake',
      description: '',
      date: '2027-03-10T22:00:00-03:00',
      location: 'x',
      color: '#000000',
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects batch actions signed for another event', async () => {
    const event = await createEvent()
    const action = await diego.sign('BatchCreated', {
      eventId: 'freshers-welcome',
      batchId: 'b9',
      priceCents: 3000,
      quantity: 10, resaleCapPercent: 120,
    })
    const response = await diego.post(`/events/${event.id}/batches`, {
      changes: [{ batchId: 'b9', name: 'Sneaky', action }],
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses to change a batch after its first sale', async () => {
    const action = await diego.sign('BatchUpdated', {
      eventId: 'end-of-year-party',
      batchId: 'b2',
      priceCents: 9900,
      quantity: 300, resaleCapPercent: 120,
    })
    const response = await diego.post('/events/end-of-year-party/batches', {
      changes: [{ batchId: 'b2', action }],
    })
    expect(response.statusCode).toBe(409)
    expect(body(response).message).toContain('frozen')
  })

  it('renames a batch even after sales, since names are not ledger records', async () => {
    const response = await diego.post('/events/end-of-year-party/batches', {
      changes: [{ batchId: 'b1', name: 'First batch' }],
    })
    expect(response.statusCode).toBe(200)
    const event = body<EventBody>(await student.get('/events/end-of-year-party'))
    expect(event.batches[0].name).toBe('First batch')
  })

  it('removes a batch without sales', async () => {
    const action = await diego.sign('BatchRemoved', { eventId: 'end-of-year-party', batchId: 'b3' })
    const response = await diego.post('/events/end-of-year-party/batches', {
      changes: [{ batchId: 'b3', action }],
    })
    expect(response.statusCode).toBe(200)
    const event = body<EventBody>(await student.get('/events/end-of-year-party'))
    expect(event.batches.map((batch) => batch.id)).toEqual(['b1', 'b2'])
  })
})
