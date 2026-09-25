/** How recipes read a value: as text for interpolation, as a truth for conditions. Shared by templates and expressions. */

/** Resolves a dotted path to a value; `undefined` when unknown. */
export type Lookup = (path: string) => unknown

/**
 * Truthiness as recipes mean it: `when` and `until` conditions.
 *
 * @param value - Any rendered value.
 * @returns `false` for `undefined`, `null`, `''`, `0`, `false`, `'false'`, `'0'`, `'null'` and an empty list.
 */
export function isTruthy (value: unknown): boolean {
  if ([undefined, null, false, 0].includes(value as null)) return false
  if (typeof value === 'string') return !['', 'false', '0', 'null', 'undefined'].includes(value.trim().toLowerCase())
  if (Array.isArray(value)) return value.length > 0

  return true
}

/**
 * The text form of a value for interpolation.
 *
 * @param value - Any value.
 * @returns A string; objects and arrays as JSON.
 */
export function stringify (value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}
