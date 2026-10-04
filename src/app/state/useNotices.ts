import { create } from 'zustand'

export type NoticeKind = 'error' | 'info'
export interface Notice {
  readonly id: number
  readonly kind: NoticeKind
  readonly message: string
}
export interface NoticesState {
  notices: Notice[]
  notify(kind: NoticeKind, message: string): number
  dismiss(id: number): void
  clear(): void
}

const MAX_NOTICES = 4
let nextId = 1

export const useNotices = create<NoticesState>()((set, get) => ({
  notices: [],
  notify: (kind, message) => {
    const existing = get().notices.find((n) => n.kind === kind && n.message === message)
    if (existing) return existing.id
    const id = nextId++
    set((s) => ({ notices: [...s.notices, { id, kind, message }].slice(-MAX_NOTICES) }))
    return id
  },
  dismiss: (id) => {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
  },
  clear: () => {
    set({ notices: [] })
  },
}))
