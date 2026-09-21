import type { Config } from './shared/config.ts'

// Explicit composition root: everything a use case may need, built once at boot.
export type Deps = {
  config: Config
}

export function createDependencies(config: Config): Deps {
  return { config }
}
