import { useEffect, useState } from 'react'
import { api } from './client'
import type { ResaleListing } from './types'

// Tickets offered for resale, optionally for one event.
export function useListings(eventId?: string) {
  const [listings, setListings] = useState<ResaleListing[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .get<ResaleListing[]>('/resale')
      .then((all) => {
        if (!cancelled) setListings(eventId ? all.filter((item) => item.eventId === eventId) : all)
      })
      .catch(() => {
        if (!cancelled) setListings([])
      })
    return () => {
      cancelled = true
    }
  }, [eventId])
  return listings
}
