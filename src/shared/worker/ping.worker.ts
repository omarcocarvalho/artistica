import { expose } from 'comlink'
import { ping, type PingApi } from './ping'

// `DedicatedWorkerGlobalScope` only exists in the WebWorker lib. tsconfig.worker.json has it and
// tsconfig.app.json does not, so this line makes `tsc -b` prove the two programs are separate.
const scope = self as unknown as DedicatedWorkerGlobalScope
const api: PingApi = { ping }

expose(api, scope)
