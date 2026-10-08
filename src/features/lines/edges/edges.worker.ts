import { expose } from 'comlink'
import { edgeOutline } from './outline'
import { createEdgeWorkerApi, offscreenEnv } from './worker-api'

expose(createEdgeWorkerApi(offscreenEnv(), () => Promise.resolve(edgeOutline)))
