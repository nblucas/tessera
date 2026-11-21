import { api } from '../api/client'

const STORAGE_PREFIX = 'tessera.'

// Demo only: the backend wipes all data and loads the seed again. Roadmap features still keep
// their data in localStorage, so that is cleared too.
export async function resetDemoData() {
  await api.post('/demo/reset')
  try {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(STORAGE_PREFIX))
    for (const key of keys) {
      localStorage.removeItem(key)
    }
  } catch {
    // Storage unavailable: nothing was persisted locally.
  }
  window.location.assign('/login')
}
