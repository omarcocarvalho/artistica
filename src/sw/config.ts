export interface ShellConfig {
  readonly cache: string
  readonly base: string
  readonly shell: readonly string[]
  readonly bypass: readonly string[]
}

export const SHELL_CACHE_PREFIX = 'artistica-shell-'
