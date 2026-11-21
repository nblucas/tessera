import type { BatchView, EventView } from '../api/types'

export type Batch = BatchView

// resaleCapPercent belongs to the resale roadmap feature; the backend does not store it yet.
export type Event = EventView & { resaleCapPercent: number }

export const DEFAULT_RESALE_CAP_PERCENT = 120
