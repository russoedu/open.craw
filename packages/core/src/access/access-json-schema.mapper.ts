import { z } from 'zod'
import { accessConfigSchema } from './access-profile.contract'

/**
 * The JSON Schema for access config files, for editors: point `$schema` at
 * `schemas/access-config.schema.json`.
 *
 * @returns A draft 2020-12 document.
 */
export function accessConfigJsonSchema (): Record<string, unknown> {
  return { ...z.toJSONSchema(accessConfigSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' }), $id: 'https://opencraw/schemas/access-config.schema.json', title: 'OpenCraw access config' }
}
