import { loadAccessConfig } from '@open.craw/core'
import type { AccessConfig } from '@open.craw/core'
import type { CommonOptions } from '../arguments'

/**
 * The access config a command runs with: the file `--access` (or
 * `OPEN_CRAW_ACCESS`) names, with `--access-profile` as its default.
 *
 * @param options - The command's shared options.
 * @returns The config, or `undefined` for direct access.
 * @throws Error when a profile is asked for without a config, or is not in it.
 */
export async function resolveAccess (options: CommonOptions): Promise<AccessConfig | undefined> {
  if (options.access === undefined) {
    if (options.accessProfile !== undefined) throw new Error('--access-profile needs an access config: --access <file> or OPEN_CRAW_ACCESS')

    return undefined
  }
  const config = await loadAccessConfig(options.access)
  if (options.accessProfile === undefined) return config
  if (!Object.hasOwn(config.profiles, options.accessProfile)) {
    throw new Error(`access profile "${options.accessProfile}" is not in ${options.access} (profiles: ${Object.keys(config.profiles).join(', ') || 'none'})`)
  }

  return { ...config, default: options.accessProfile }
}
