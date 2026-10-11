import type { TFunction } from 'i18next'
import type { PaperId } from '../../shared/model/paper'

const NAME_KEYS: Readonly<Record<PaperId, string | null>> = {
  A3: null,
  A4: null,
  A5: null,
  A6: null,
  Letter: 'pageSetup:paper.name.letter',
  Legal: 'pageSetup:paper.name.legal',
  Tabloid: 'pageSetup:paper.name.tabloid',
  Custom: 'pageSetup:paper.name.custom',
}

/** M6-R25: ISO sizes as they are; the named sizes and Custom in the language showing. */
export function paperName(id: PaperId, t: TFunction): string {
  const key = NAME_KEYS[id]
  return key === null ? id : t(key)
}
