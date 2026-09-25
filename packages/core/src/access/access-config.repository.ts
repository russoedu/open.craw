import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { accessConfigSchema } from './access-profile.contract'
import type { AccessConfig } from './access-profile.contract'
import { AccessConfigError } from './access-config.error'

/**
 * Reads an access config file. Secrets stay out of it: profiles reference
 * them as `{{env.NAME}}`, resolved when a profile is leased.
 *
 * @param path - A JSON file.
 * @returns The validated config.
 * @throws AccessConfigError when the file is not JSON or not a valid config.
 */
export async function loadAccessConfig (path: string): Promise<AccessConfig> {
  const file = resolve(path)
  let value: unknown
  try {
    value = JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch (error) {
    throw new AccessConfigError(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  const parsed = accessConfigSchema.safeParse(value)
  if (!parsed.success) throw new AccessConfigError(`${file}: ${parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`)

  return parsed.data
}
