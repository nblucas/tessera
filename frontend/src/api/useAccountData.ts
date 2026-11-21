import { useCallback, useEffect, useState } from 'react'

// Loads data for one account. `key` identifies the account (null: nothing to load), so data
// from a previous account is never shown after signing out or switching accounts.
// `load` and `empty` must be stable (module-level), or the data reloads on every render.
export function useAccountData<T>(key: string | null, load: () => Promise<T>, empty: T) {
  const [state, setState] = useState<{ key: string; value: T } | null>(null)

  const refresh = useCallback(async () => {
    if (key === null) return
    const value = await load()
    setState({ key, value })
  }, [key, load])

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    load()
      .then((value) => {
        if (!cancelled) setState({ key, value })
      })
      .catch((error: unknown) => console.error(error))
    return () => {
      cancelled = true
    }
  }, [key, load])

  const current = key !== null && state?.key === key
  const update = useCallback(
    (change: (value: T) => T) => {
      if (key === null) return
      setState((previous) => ({
        key,
        value: change(previous?.key === key ? previous.value : empty),
      }))
    },
    [key, empty],
  )

  return {
    data: current ? state.value : empty,
    loading: key !== null && !current,
    refresh,
    update,
  }
}
