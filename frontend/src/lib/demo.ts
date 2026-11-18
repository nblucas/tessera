const STORAGE_PREFIX = 'tessera.'

export function resetDemoData() {
  try {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(STORAGE_PREFIX))
    for (const key of keys) {
      localStorage.removeItem(key)
    }
  } catch {
    // Storage unavailable: nothing was persisted, so a reload is enough.
  }
  window.location.assign('/login')
}
