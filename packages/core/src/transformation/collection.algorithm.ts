import { describe, trim } from './string.algorithm'
import { TransformError } from './transform.error'

/** The input as a list: a list as is, a missing value as empty; anything else fails the op. */
export function asList (op: string, value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  throw new TransformError(op, `expects a list, got ${describe(value)}`, value)
}

export function first (value: unknown): unknown {
  return asList('first', value)[0]
}

export function last (value: unknown): unknown {
  return asList('last', value).at(-1)
}

export function nth (value: unknown, index: number): unknown {
  return asList('nth', value).at(index)
}

export function slice (value: unknown, start: number, end?: number): unknown[] {
  return asList('slice', value).slice(start, end)
}

export function join (value: unknown, separator: string): string {
  return asList('join', value).map(item => text('join', item)).join(separator)
}

export function concat (value: unknown, separator = ''): string {
  return join(value, separator)
}

/** The first value that is not `undefined`, `null` or blank text. */
export function coalesce (value: unknown): unknown {
  return asList('coalesce', value).find(item => item !== undefined && item !== null && !(typeof item === 'string' && trim(item) === ''))
}

export function flatten (value: unknown): unknown[] {
  return asList('flatten', value).flat(Infinity)
}

export function unique (value: unknown): unknown[] {
  const seen = new Set<string>()

  return asList('unique', value).filter((item) => {
    const key = typeof item === 'string' ? item : JSON.stringify(item)
    if (seen.has(key)) return false
    seen.add(key)

    return true
  })
}

export function sum (value: unknown): number {
  return asList('sum', value).reduce<number>((total, item) => {
    if (typeof item !== 'number') throw new TransformError('sum', `expects numbers, got ${describe(item)}`, item)

    return total + item
  }, 0)
}

export function count (value: unknown): number {
  return asList('count', value).length
}

function text (op: string, item: unknown): string {
  if (typeof item === 'string') return item
  if (typeof item === 'number' || typeof item === 'boolean') return String(item)
  if (item === undefined || item === null) return ''
  throw new TransformError(op, `expects text items, got ${describe(item)}`, item)
}
