import { z } from 'zod'
import { accessConfigSchema } from './access-profile.contract'

/**
 * The JSON Schema for access config files, for editors: point `$schema` at
 * `schemas/access-config.schema.json`.
 *
 * @returns A draft 2020-12 document.
 */
export function accessConfigJsonSchema (): Record<string, unknown> {
  return { ...z.toJSONSchema(accessConfigSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' }), $id: 'https://open.craw/schemas/access-config.schema.json', title: 'open.craw access config' }
}
