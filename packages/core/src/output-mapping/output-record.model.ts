/** One record a crawl produced, validated against its output recipe. */
export interface OutputRecord {
  data:   Record<string, unknown>
  /** The identity from the output's `key` fields, `null` when the output declares none. */
  key:    string | null
  source: {
    recipeId:  string
    url:       string
    emittedAt: string
  }
}

/**
 * The identity of a record: its key field values, in output order, as one string.
 *
 * @param data - The validated record data.
 * @param keyFields - The output fields marked `key`.
 * @returns The key, or `null` when there are no key fields.
 */
export function recordKey (data: Record<string, unknown>, keyFields: readonly string[]): string | null {
  if (keyFields.length === 0) return null

  return JSON.stringify(keyFields.map(field => data[field] ?? null))
}
