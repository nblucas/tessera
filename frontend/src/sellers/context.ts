import { createContext, useContext } from 'react'
import type { Seller } from '../data/sellers'

export type SellersContextValue = {
  sellers: Seller[]
  findSeller: (id: string | null | undefined) => Seller | undefined
  findSellerByEmail: (email: string | undefined) => Seller | undefined
  saveSeller: (seller: Seller) => void
  removeSeller: (id: string) => void
}

export const SellersContext = createContext<SellersContextValue | null>(null)

export function useSellers(): SellersContextValue {
  const value = useContext(SellersContext)
  if (!value) {
    throw new Error('useSellers must be used inside <SellersProvider>')
  }
  return value
}
