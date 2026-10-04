import { useImages } from '../../features/images'

export function useImageCount(): number {
  return useImages((s) => s.images.length)
}
