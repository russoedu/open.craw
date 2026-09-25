import type { FieldSpec } from '../recipe-schema'
import { parseBoolean, parseCurrency, parseDate, parseInteger, parseNumber, toIsoDate, TransformError } from '../transformation'

/** A value that cannot become the field's type. */
export class CoercionError extends Error {
  override readonly name = 'CoercionError'

  constructor (readonly path: string, reason: string) {
    super(`${path}: ${reason}`)
  }
}

/**
 * Converts a transformed value into the field's declared type.
 * `null` and `undefined` pass through: missing-value policies decide about them.
 *
 * @param value - The value after its transform chain.
 * @param field - The output field.
 * @param path - Where the field is, for messages.
 * @returns The coerced value.
 * @throws CoercionError when the conversion is impossible.
 */
export function coerceValue (value: unknown, field: FieldSpec, path: string): unknown {
  if (value === undefined || value === null) return value
  try {
    return coerce(value, field, path)
  } catch (error) {
    if (error instanceof CoercionError) throw error
    throw new CoercionError(path, error instanceof TransformError ? error.message : `cannot convert ${JSON.stringify(value)} to ${field.type}`)
  }
}

function coerce (value: unknown, field: FieldSpec, path: string): unknown {
  switch (field.type) {
    case 'string': { return typeof value === 'string' ? value : text(value, path)
    }
    case 'number': { return parseNumber(value)
    }
    case 'integer': { return parseInteger(value)
    }
    case 'boolean': { return parseBoolean(value)
    }
    case 'date': { return toIsoDate(parseDate(value, field.format))
    }
    case 'datetime': { return parseDate(value, field.format).toISOString()
    }
    case 'currency': { return currency(value, field, path)
    }
    case 'url': { return url(value, path)
    }
    case 'enum': { return enumeration(value, field, path)
    }
    case 'array': { return array(value, field, path)
    }
    case 'object': { return object(value, field, path)
    }
    case 'json': { return json(value, path)
    }
  }
}

function text (value: unknown, path: string): string {
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  throw new CoercionError(path, `expected text, got ${Array.isArray(value) ? 'a list' : typeof value}`)
}

function currency (value: unknown, field: FieldSpec, path: string): { amount: number, currency: string } {
  const money = typeof value === 'object' && value !== null && 'amount' in value
    ? { amount: parseNumber((value).amount), currency: (value as { currency?: string }).currency }
    : parseCurrency(value, undefined, field.currency)
  const code = field.currency ?? money.currency
  if (code === undefined) throw new CoercionError(path, 'no currency: set "currency" on the field or use the currency transform')

  return { amount: money.amount, currency: code }
}

function url (value: unknown, path: string): string {
  if (typeof value !== 'string') throw new CoercionError(path, 'expected a URL string')
  try {
    return new URL(value.trim()).href
  } catch {
    throw new CoercionError(path, `"${value}" is not an absolute URL (use the absoluteUrl transform)`)
  }
}

function enumeration (value: unknown, field: FieldSpec, path: string): string {
  const candidate = typeof value === 'string' ? value : text(value, path)
  if (!(field.values ?? []).includes(candidate)) throw new CoercionError(path, `"${candidate}" is not one of ${(field.values ?? []).join(', ')}`)

  return candidate
}

function array (value: unknown, field: FieldSpec, path: string): unknown[] {
  const items = Array.isArray(value) ? value : [value]
  const spec = field.items
  if (spec === undefined) return items

  return items.map((item, index) => coerceValue(item, spec, `${path}[${index}]`))
}

/**
 * Any JSON value, kept as is: an object with every key, however nested, a list,
 * text, a number. Only what JSON cannot hold is refused, so the sink never
 * sees a function or a `Date` it would silently turn into something else.
 *
 * @param value - The value.
 * @param path - Where the field is, for messages.
 * @returns The same value.
 * @throws CoercionError for a value JSON cannot represent.
 */
function json (value: unknown, path: string): unknown {
  const problem = nonJson(value, path)
  if (problem !== undefined) throw new CoercionError(problem.path, `${problem.what} is not JSON`)

  return value
}

function nonJson (value: unknown, path: string): { path: string, what: string } | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : { path, what: String(value) }
  if (Array.isArray(value)) return value.map((item, index) => nonJson(item, `${path}[${index}]`)).find(found => found !== undefined)
  if (typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) {
    return Object.entries(value).map(([key, item]) => (item === undefined ? undefined : nonJson(item, `${path}.${key}`))).find(found => found !== undefined)
  }

  return { path, what: value === undefined ? 'undefined' : (typeof value === 'object' ? (value.constructor?.name ?? 'an object') : `a ${typeof value}`) }
}

function object (value: unknown, field: FieldSpec, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CoercionError(path, 'expected an object')
  const result: Record<string, unknown> = {}
  const members = Object.entries(field.fields ?? {})
  for (const [name, spec] of members) {
    result[name] = coerceValue((value as Record<string, unknown>)[name], spec, `${path}.${name}`)
  }

  return result
}
