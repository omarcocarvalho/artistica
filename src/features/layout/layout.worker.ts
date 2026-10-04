import { expose } from 'comlink'
import { layoutWorkerApi } from './worker-api'

expose(layoutWorkerApi)
