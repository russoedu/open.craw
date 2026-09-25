import { TransformError } from './transform.error'

function asText (op: string, value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  throw new TransformError(op, `expects text, got ${describe(value)}`, value)
}

/** A short description of a value for error messages. */
export function describe (value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `a list of ${value.length}`

  return typeof value
}

export function trim (value: unknown): string {
  return asText('trim', value).trim()
}

export function lowercase (value: unknown): string {
  return asText('lowercase', value).toLowerCase()
}

export function uppercase (value: unknown): string {
  return asText('uppercase', value).toUpperCase()
}

export function replace (value: unknown, pattern: string, replacement: string, flags = 'g'): string {
  return asText('replace', value).replace(compile('replace', pattern, flags), (...match: unknown[]) => expand(replacement, match))
}

/**
 * The first match of a pattern.
 *
 * @param value - The text.
 * @param pattern - A regular expression source.
 * @param group - The capture group to return; default: group 1 when the pattern has one, else the whole match.
 * @param flags - Regular expression flags.
 * @returns The captured text, or `undefined` when nothing matches.
 */
export function regex (value: unknown, pattern: string, group?: number, flags = ''): string | undefined {
  const expression = compile('regex', pattern, flags.replaceAll('g', ''))
  const match = expression.exec(asText('regex', value))
  if (match === null) return undefined
  const index = group ?? (match.length > 1 ? 1 : 0)
  if (index >= match.length) throw new TransformError('regex', `pattern has no group ${index}`)

  return match[index]
}

export function split (value: unknown, separator: string): string[] {
  return asText('split', value).split(separator)
}

/**
 * Expands `$1`..`$9` and `$&` in a replacement, the way `String#replace` does
 * with a string replacement. Done by hand so the replacement is never
 * interpreted as a pattern of its own.
 *
 * @param replacement - The recipe's replacement text.
 * @param match - The match arguments: whole match, then groups.
 * @returns The expanded text.
 */
function expand (replacement: string, match: unknown[]): string {
  return replacement.replaceAll(/\$(\d|&)/g, (token, group: string) => {
    if (group === '&') return String(match[0])
    const value = match[Number(group)]

    return typeof value === 'string' ? value : token
  })
}

function compile (op: string, pattern: string, flags: string): RegExp {
  try {
    return new RegExp(pattern, flags)
  } catch (error) {
    throw new TransformError(op, `invalid pattern ${pattern}: ${(error as Error).message}`, undefined)
  }
}
