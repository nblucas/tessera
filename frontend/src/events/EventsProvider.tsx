import type { ReactNode } from 'react'
import { api } from '../api/client'
import { useAccountData } from '../api/useAccountData'
import type { EventView } from '../api/types'
import { useAuth } from '../auth/context'
import { DEFAULT_RESALE_CAP_PERCENT, type Event } from '../data/events'
import { EventsContext, type BatchChange, type EventDetails } from './context'

function toEvent(view: EventView): Event {
  return { ...view, resaleCapPercent: DEFAULT_RESALE_CAP_PERCENT }
}

const NO_EVENTS: Event[] = []
const loadEvents = async () => (await api.get<EventView[]>('/events')).map(toEvent)

export function EventsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { data: events, loading, refresh, update } = useAccountData(
    user?.id ?? null,
    loadEvents,
    NO_EVENTS,
  )

  function store(view: EventView): Event {
    const event = toEvent(view)
    update((current) => {
      const others = current.filter((item) => item.id !== event.id)
      return [...others, event].sort((a, b) => a.date.localeCompare(b.date))
    })
    return event
  }

  function findEvent(eventId: string | undefined) {
    return events.find((event) => event.id === eventId)
  }

  async function createEvent(details: EventDetails) {
    return store(await api.post<EventView>('/events', details))
  }

  async function updateEvent(eventId: string, details: EventDetails) {
    return store(await api.patch<EventView>(`/events/${eventId}`, details))
  }

  async function changeBatches(eventId: string, changes: BatchChange[]) {
    return store(await api.post<EventView>(`/events/${eventId}/batches`, { changes }))
  }

  return (
    <EventsContext.Provider
      value={{ events, loading, findEvent, refresh, createEvent, updateEvent, changeBatches }}
    >
      {children}
    </EventsContext.Provider>
  )
}
