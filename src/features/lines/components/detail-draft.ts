import { create } from 'zustand'

/** A Detail value the user set that the section has not yet committed to the image's lines. */
export const useDetailDraft = create<{ readonly pending: boolean }>()(() => ({ pending: false }))
