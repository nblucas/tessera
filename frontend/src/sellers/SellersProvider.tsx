import { useState, type ReactNode } from 'react'
import { SEED_SELLERS, type Seller } from '../data/sellers'
import { SellersContext } from './context'

const STORAGE_KEY = 'tessera.sellers'

function loadSellers(): Seller[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Seller[]) : SEED_SELLERS
  } catch {
    return SEED_SELLERS
  }
}

function persist(sellers: Seller[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sellers))
  } catch {
    // Storage unavailable: keep sellers in memory only.
  }
}

export function SellersProvider({ children }: { children: ReactNode }) {
  const [sellers, setSellers] = useState<Seller[]>(loadSellers)

  function update(change: (current: Seller[]) => Seller[]) {
    setSellers((current) => {
      const next = change(current)
      persist(next)
      return next
    })
  }

  function findSeller(id: string | null | undefined) {
    return sellers.find((seller) => seller.id === id)
  }

  function findSellerByEmail(email: string | undefined) {
    return sellers.find((seller) => seller.email === email)
  }

  function saveSeller(seller: Seller) {
    update((current) =>
      current.some((item) => item.id === seller.id)
        ? current.map((item) => (item.id === seller.id ? seller : item))
        : [...current, seller],
    )
  }

  function removeSeller(id: string) {
    update((current) => current.filter((seller) => seller.id !== id))
  }

  return (
    <SellersContext.Provider
      value={{ sellers, findSeller, findSellerByEmail, saveSeller, removeSeller }}
    >
      {children}
    </SellersContext.Provider>
  )
}
