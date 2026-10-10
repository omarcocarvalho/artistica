import i18n from 'i18next'
import { useEffect, useRef } from 'react'
import { selectImageDescriptors, useImages } from '../../features/images'
import { buildLayoutItems, layoutAsync, type ManualOutcome } from '../../features/layout'
import { guidesFor, useDetections } from '../../features/lines'
import { buildPageModels } from '../../features/render'
import { useSettings } from '../../features/settings'
import { useArrange } from '../arrange-store'
import { createPipeline, type Pipeline } from '../pipeline'
import { usePages } from '../pages-store'
import { useNotices } from '../state/useNotices'

const DROPPED_NOTICE: Record<'paper' | 'no-longer-fits', string> = {
  paper: 'preview:arrange.dropped.paper',
  'no-longer-fits': 'preview:arrange.dropped.noLongerFits',
}

function adoptOutcome(outcome: ManualOutcome | undefined): void {
  if (outcome === undefined) return
  const arranged = useArrange.getState().manual !== null
  useArrange.getState().adopt(outcome)
  if (arranged && outcome.kind === 'dropped' && outcome.reason !== 'empty') {
    useNotices.getState().notify('info', i18n.t(DROPPED_NOTICE[outcome.reason]))
  }
}

function scheduleFromStores(pipeline: Pipeline | null): void {
  const detections = useDetections.getState()
  pipeline?.schedule(
    useSettings.getState().pageSetup,
    selectImageDescriptors(useImages.getState()),
    (img) => guidesFor(detections, img),
    useArrange.getState().manual,
  )
}

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
        done: (layout, pages) => {
          sink.done(layout, pages)
          adoptOutcome(layout.manual)
        },
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
    pipelineRef.current?.schedule(
      pageSetup,
      images,
      (img) => guidesFor(detections, img),
      useArrange.getState().manual,
    )
  }, [pageSetup, images])

  useEffect(
    () =>
      useDetections.subscribe((detections, previous) => {
        if (detections.results === previous.results) return
        scheduleFromStores(pipelineRef.current)
      }),
    [],
  )

  // Synchronous, so a result computed for the previous arrangement can never be adopted over an edit.
  useEffect(
    () =>
      useArrange.subscribe((arrange, previous) => {
        if (arrange.manual === previous.manual) return
        scheduleFromStores(pipelineRef.current)
      }),
    [],
  )

  return null
}
