import type { SignedAction } from '@tessera/shared'
import { createContext, useContext } from 'react'
import type { Event } from '../data/events'

export type EventDetails = {
  title: string
  description: string
  date: string
  location: string
  color: string
}

// A batch change: a signed ledger action (create, update, remove), a new name, or both.
export type BatchChange = { batchId: string; name?: string; action?: SignedAction }

export type EventsContextValue = {
  events: Event[]
  loading: boolean
  findEvent: (eventId: string | undefined) => Event | undefined
  refresh: () => Promise<void>
  createEvent: (details: EventDetails) => Promise<Event>
  updateEvent: (eventId: string, details: EventDetails) => Promise<Event>
  changeBatches: (eventId: string, changes: BatchChange[]) => Promise<Event>
}

export const EventsContext = createContext<EventsContextValue | null>(null)

export function useEvents(): EventsContextValue {
  const value = useContext(EventsContext)
  if (!value) {
    throw new Error('useEvents must be used inside <EventsProvider>')
  }
  return value
}
