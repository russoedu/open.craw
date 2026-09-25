import { z } from 'zod'
import { inputRecipeSchema } from './input-recipe.contract'
import { outputRecipeSchema } from './output-recipe.contract'

/** A JSON Schema document, as `z.toJSONSchema` produces it. */
export type JsonSchemaDocument = Record<string, unknown>

const OPTIONS = { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' } as const

/**
 * The JSON Schema for output recipe files, for editors and other tools.
 *
 * @returns A draft 2020-12 document.
 */
export function outputRecipeJsonSchema (): JsonSchemaDocument {
  return { ...z.toJSONSchema(outputRecipeSchema, OPTIONS), $id: 'https://opencraw/schemas/output-recipe.schema.json', title: 'OpenCraw output recipe' }
}

/**
 * The JSON Schema for input recipe files, for editors and other tools.
 *
 * @returns A draft 2020-12 document.
 */
export function inputRecipeJsonSchema (): JsonSchemaDocument {
  return { ...z.toJSONSchema(inputRecipeSchema, OPTIONS), $id: 'https://opencraw/schemas/input-recipe.schema.json', title: 'OpenCraw input recipe' }
}
