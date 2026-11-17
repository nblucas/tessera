import { createContext, useContext } from 'react'
import type { Event } from '../data/events'

export type EventsContextValue = {
  events: Event[]
  findEvent: (eventId: string | undefined) => Event | undefined
  saveEvent: (event: Event) => void
}

export const EventsContext = createContext<EventsContextValue | null>(null)

export function useEvents(): EventsContextValue {
  const value = useContext(EventsContext)
  if (!value) {
    throw new Error('useEvents must be used inside <EventsProvider>')
  }
  return value
}
