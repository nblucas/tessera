export type Seller = {
  id: string
  name: string
  email: string
  commissionPercent: number
}

export const SELLERS: Seller[] = [
  { id: 'ana', name: 'Ana Souza', email: 'ana@demo.com', commissionPercent: 10 },
  { id: 'bruno', name: 'Bruno Lima', email: 'bruno@demo.com', commissionPercent: 8 },
  { id: 'carla', name: 'Carla Mendes', email: 'carla@demo.com', commissionPercent: 10 },
]

export function findSeller(id: string | null | undefined): Seller | undefined {
  return SELLERS.find((seller) => seller.id === id)
}

export function findSellerByEmail(email: string | undefined): Seller | undefined {
  return SELLERS.find((seller) => seller.email === email)
}

export function commissionFor(seller: Seller, priceCents: number): number {
  return Math.round((priceCents * seller.commissionPercent) / 100)
}
