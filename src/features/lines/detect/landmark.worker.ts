/// <reference types="vite/client" />
import { expose } from 'comlink'
import { installFetchGuard, type GuardScope } from './fetch-guard'
import { createLandmarkApi, offscreenHasWebGL, type VisionModule } from './landmark-api'

const refusals: string[] = []

expose(
  createLandmarkApi({
    loadVision: (): Promise<VisionModule> => import('@mediapipe/tasks-vision'),
    loading: 'fresh-url',
    scope: self as { ModuleFactory?: unknown },
    supported: offscreenHasWebGL,
    installGuard: () => {
      installFetchGuard(
        self as unknown as GuardScope,
        new URL(import.meta.env.BASE_URL, self.location.origin).href,
        {
          onRefused: (api, url) => {
            refusals.push(`${api} ${url}`)
          },
        },
      )
    },
    takeRefusals: () => refusals.splice(0),
  }),
)
