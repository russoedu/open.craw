import { describe } from './string.algorithm'
import { TransformError } from './transform.error'

/**
 * Resolves a possibly relative URL.
 *
 * @param value - The URL text.
 * @param base - What relative URLs resolve against; usually the page URL.
 * @returns The absolute URL.
 * @throws TransformError when the result is not a valid URL.
 */
export function absoluteUrl (value: unknown, base?: string): string {
  if (typeof value !== 'string') throw new TransformError('absoluteUrl', `expects text, got ${describe(value)}`, value)
  try {
    return new URL(value.trim(), base).href
  } catch {
    throw new TransformError('absoluteUrl', `"${value}" is not a URL${base === undefined ? ' and no base is known' : ` against ${base}`}`, value)
  }
}
