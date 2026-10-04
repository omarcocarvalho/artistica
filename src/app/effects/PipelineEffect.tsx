import i18n from 'i18next'
import { useEffect } from 'react'
import { selectImageDescriptors, useImages } from '../../features/images'
import { buildLayoutItems, layoutAsync } from '../../features/layout'
import { buildPageModels } from '../../features/render'
import { useSettings } from '../../features/settings'
import { createPipeline } from '../pipeline'
import { usePages } from '../pages-store'
import { useNotices } from '../state/useNotices'

export function PipelineEffect(): null {
  const pageSetup = useSettings((s) => s.pageSetup)
  const images = useImages(selectImageDescriptors)

  useEffect(() => {
    const sink = usePages.getState().sink
    const pipeline = createPipeline(
      {
        delayMs: 80,
        buildItems: buildLayoutItems,
        layout: layoutAsync,
        buildModels: buildPageModels,
      },
      {
        ...sink,
        failed: (error) => {
          sink.failed(error)
          useNotices.getState().notify('error', i18n.t('app:notices.layoutFailed'))
        },
      },
    )
    pipeline.schedule(pageSetup, images)
    return () => {
      pipeline.dispose()
    }
  }, [pageSetup, images])

  return null
}
