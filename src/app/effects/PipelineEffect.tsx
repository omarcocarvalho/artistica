import i18n from 'i18next'
import { useEffect, useRef } from 'react'
import { selectImageDescriptors, useImages } from '../../features/images'
import { buildLayoutItems, layoutAsync } from '../../features/layout'
import { guidesFor, useDetections } from '../../features/lines'
import { buildPageModels } from '../../features/render'
import { useSettings } from '../../features/settings'
import { createPipeline, type Pipeline } from '../pipeline'
import { usePages } from '../pages-store'
import { useNotices } from '../state/useNotices'

export function PipelineEffect(): null {
  const pageSetup = useSettings((s) => s.pageSetup)
  const images = useImages(selectImageDescriptors)
  const pipelineRef = useRef<Pipeline | null>(null)

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
    pipelineRef.current = pipeline
    return () => {
      pipeline.dispose()
      pipelineRef.current = null
    }
  }, [])

  useEffect(() => {
    const detections = useDetections.getState()
    pipelineRef.current?.schedule(pageSetup, images, (img) => guidesFor(detections, img))
  }, [pageSetup, images])

  useEffect(
    () =>
      useDetections.subscribe((detections, previous) => {
        if (detections.results === previous.results) return
        pipelineRef.current?.schedule(
          useSettings.getState().pageSetup,
          selectImageDescriptors(useImages.getState()),
          (img) => guidesFor(detections, img),
        )
      }),
    [],
  )

  return null
}
