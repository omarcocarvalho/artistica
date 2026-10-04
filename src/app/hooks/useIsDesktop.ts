import { useSyncExternalStore } from 'react'

export const DESKTOP_MIN_PX = 960
const QUERY = `(min-width: ${String(DESKTOP_MIN_PX)}px)`

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => {
    mql.removeEventListener('change', onChange)
  }
}
const getSnapshot = () => window.matchMedia(QUERY).matches
const getServerSnapshot = () => true

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
