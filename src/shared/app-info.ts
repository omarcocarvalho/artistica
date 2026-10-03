export const APP_NAME = 'Artistica'

/** Document title for a page/section, e.g. pageTitle('App') === 'App · Artistica'. */
export function pageTitle(section?: string): string {
  const trimmed = section?.trim()
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME
}
