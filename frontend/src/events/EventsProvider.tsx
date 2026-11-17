import { useState, type ReactNode } from 'react'
import { SEED_EVENTS, type Event } from '../data/events'
import { EventsContext } from './context'

const STORAGE_KEY = 'tessera.events'

function loadEvents(): Event[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Event[]) : SEED_EVENTS
  } catch {
    return SEED_EVENTS
  }
}

function persist(events: Event[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // Storage unavailable: keep events in memory only.
  }
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Event[]>(loadEvents)

  function findEvent(eventId: string | undefined) {
    return events.find((event) => event.id === eventId)
  }

  function saveEvent(event: Event) {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id)
      const next = exists
        ? current.map((item) => (item.id === event.id ? event : item))
        : [...current, event]
      persist(next)
      return next
    })
  }

  return (
    <EventsContext.Provider value={{ events, findEvent, saveEvent }}>
      {children}
    </EventsContext.Provider>
  )
}
