import { z } from 'zod'
import { FIELD_TYPES, GENERATED_VALUES, MISSING_POLICIES, RECIPE_MISSING_POLICIES } from './recipe-kind.enum'
import type { FieldType, GeneratedValue, MissingPolicy, RecipeMissingPolicy } from './recipe-kind.enum'

/** One field of the records a crawl produces: its type, quality rules and what to do when it is missing. */
export interface FieldSpec {
  type:         FieldType
  description?: string
  /** Default `false`. */
  required?:    boolean
  /** Default `false`. */
  nullable?:    boolean
  /** Used when the value is missing and the resolved policy is `default`. */
  default?:     unknown
  onMissing?:   MissingPolicy
  /** Part of the record identity, used to drop duplicates. */
  key?:         boolean
  /** Supplied by the engine, never mapped. */
  generated?:   GeneratedValue
  /** Input format for `date` / `datetime`; output is always ISO 8601. */
  format?:      string
  /** ISO 4217 code for `currency`. */
  currency?:    string
  /** Allowed values for `enum`. */
  values?:      string[]
  /** Element spec for `array`. */
  items?:       FieldSpec
  /** Member specs for `object`. */
  fields?:      Record<string, FieldSpec>
  min?:         number
  max?:         number
  pattern?:     string
  minLength?:   number
  maxLength?:   number
}

/** The schema of the records every input recipe bound to it must produce. */
export interface OutputRecipe {
  $schema?:     string
  kind:         'output'
  id:           string
  version:      number
  description?: string
  fields:       Record<string, FieldSpec>
  /** Recipe-wide default: `fail` for required fields, `null` otherwise. */
  onMissing?:   RecipeMissingPolicy
}

const fieldShape = {
  type:        z.enum(FIELD_TYPES),
  description: z.string().optional(),
  required:    z.boolean().optional(),
  nullable:    z.boolean().optional(),
  default:     z.unknown().optional(),
  onMissing:   z.enum(MISSING_POLICIES).optional(),
  key:         z.boolean().optional(),
  generated:   z.enum(GENERATED_VALUES).optional(),
  format:      z.string().optional(),
  currency:    z.string().length(3).optional(),
  values:      z.array(z.string()).min(1).optional(),
  min:         z.number().optional(),
  max:         z.number().optional(),
  pattern:     z.string().optional(),
  minLength:   z.int().nonnegative().optional(),
  maxLength:   z.int().nonnegative().optional(),
}

const fieldMap = z.record(z.string(), z.lazy(() => fieldSpecSchema))

const REQUIRES: Partial<Record<FieldType, keyof FieldSpec>> = { enum: 'values', array: 'items', object: 'fields' }

export const fieldSpecSchema: z.ZodType<FieldSpec> = z.strictObject({
  ...fieldShape,
  items:  z.lazy(() => fieldSpecSchema).optional(),
  fields: z.lazy(() => fieldMap).optional(),
}).check((context) => {
  const field = context.value
  const needed = REQUIRES[field.type]
  if (needed !== undefined && field[needed] === undefined) {
    context.issues.push({ code: 'custom', input: field, path: [needed], message: `a "${field.type}" field needs "${needed}"` })
  }
  if (field.generated !== undefined && field.required === true) {
    context.issues.push({ code: 'custom', input: field, path: ['required'], message: 'a generated field is always present; drop "required"' })
  }
})

export const outputRecipeSchema: z.ZodType<OutputRecipe> = z.strictObject({
  $schema:     z.string().optional(),
  kind:        z.literal('output'),
  id:          z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'an id is lowercase letters, digits and hyphens'),
  version:     z.int().positive(),
  description: z.string().optional(),
  fields:      z.record(z.string().regex(/^[A-Z_][\w-]*$/i, 'a field name has no dots'), fieldSpecSchema),
  onMissing:   z.enum(RECIPE_MISSING_POLICIES).optional(),
})
