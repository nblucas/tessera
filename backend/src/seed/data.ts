// Seed data matching the frontend's demo (frontend/src/data/events.ts).
export const SEED_EVENTS = [
  {
    id: 'end-of-year-party',
    title: 'End of Year Party',
    description: 'The last party of the semester, with three DJs and an open bar until 2 a.m.',
    date: '2026-12-12T22:00:00-03:00',
    location: 'Clube Atlético Paulistano, São Paulo',
    color: '#7c54c8',
    resaleCapPercent: 120,
    batches: [
      { id: 'b1', name: '1st batch', priceCents: 4000, quantity: 200, sold: 200 },
      { id: 'b2', name: '2nd batch', priceCents: 5500, quantity: 300, sold: 214 },
      { id: 'b3', name: '3rd batch', priceCents: 7000, quantity: 200, sold: 0 },
    ],
  },
  {
    id: 'freshers-welcome',
    title: 'Freshers Welcome 2027',
    description: 'Welcome party for the new students. Freshers get in for half the price.',
    date: '2027-02-20T21:00:00-03:00',
    location: 'Espaço Villa Lobos, São Paulo',
    color: '#ec8d50',
    resaleCapPercent: 110,
    batches: [
      { id: 'b1', name: 'Freshers', priceCents: 2500, quantity: 150, sold: 32 },
      { id: 'b2', name: 'General', priceCents: 5000, quantity: 350, sold: 41 },
    ],
  },
  {
    id: 'interuniversity-games',
    title: 'Interuniversity Games',
    description: 'Three days of games against other universities, with a party every night.',
    date: '2027-04-16T08:00:00-03:00',
    location: 'Ginásio Municipal, Campinas',
    color: '#51b8aa',
    resaleCapPercent: 120,
    batches: [
      { id: 'b1', name: 'Full pass', priceCents: 18000, quantity: 400, sold: 97 },
      { id: 'b2', name: 'Single day', priceCents: 7000, quantity: 300, sold: 12 },
    ],
  },
  {
    id: 'halloween-night',
    title: 'Halloween Night',
    description: 'Costume party. The best costume wins a full pass to the Interuniversity Games.',
    date: '2026-12-05T23:00:00-03:00',
    location: 'Galpão 21, São Paulo',
    color: '#343058',
    resaleCapPercent: 100,
    batches: [{ id: 'b1', name: 'Single batch', priceCents: 3500, quantity: 250, sold: 250 }],
  },
]
