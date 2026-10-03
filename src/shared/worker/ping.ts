/** The pure part of the proof worker. Real workers follow this shape: logic here, `expose` in the worker file. */
export function ping(message: string): string {
  return `pong:${message}`
}

export interface PingApi {
  ping: typeof ping
}
