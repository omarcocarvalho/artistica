import { expose, transfer } from 'comlink'
import { createStudyWorkerApi, offscreenEnv, type StudyWorkerApi } from './worker-api'

const api = createStudyWorkerApi(offscreenEnv())

const exposed: StudyWorkerApi = {
  init: () => api.init(),
  renderStudyTile: async (plan, bitmap, study) => {
    const out = await api.renderStudyTile(plan, bitmap, study)
    return transfer(out, [out])
  },
}

expose(exposed)
