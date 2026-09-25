import { randomUUID } from 'node:crypto'
import type { GeneratedValue } from '../recipe-schema'

/** What generated fields are produced from. */
export interface GenerationSource {
  recipeId:  string
  url:       string
  emittedAt: string
}

/**
 * The engine-supplied value of a generated field.
 *
 * @param kind - Which value.
 * @param source - Where the record came from.
 * @returns The value.
 */
export function generatedValue (kind: GeneratedValue, source: GenerationSource): unknown {
  if (kind === 'now') return source.emittedAt
  if (kind === 'uuid') return randomUUID()
  if (kind === 'sourceUrl') return source.url

  return source.recipeId
}
