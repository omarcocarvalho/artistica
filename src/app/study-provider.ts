import { useImages } from '../features/images'
import type { PreviewSource } from '../features/render'
import { createAppStudyProvider } from '../features/studies'
import type { ImageId } from '../shared/model/image'

export function getPreviewSource(id: ImageId): PreviewSource | undefined {
  const image = useImages.getState().images.find((i) => i.id === id)
  return image && { bitmap: image.preview, pxW: image.pxW, pxH: image.pxH }
}

/** The app's one study provider (ruling "C2 dispose and singleton reset"): never disposed by React. */
export const appStudyProvider = createAppStudyProvider(getPreviewSource)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    appStudyProvider.dispose()
  })
}
