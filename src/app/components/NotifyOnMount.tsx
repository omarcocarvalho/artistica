import { useEffect } from 'react'
import { useNotices, type NoticeKind } from '../state/useNotices'

/** Posts one notice once the app is on screen, so the notice region already exists to announce it. */
export function NotifyOnMount({ kind, message }: { kind: NoticeKind; message: string }) {
  useEffect(() => {
    useNotices.getState().notify(kind, message)
  }, [kind, message])
  return null
}
