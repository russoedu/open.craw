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

function object (value: unknown, field: FieldSpec, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CoercionError(path, 'expected an object')
  const result: Record<string, unknown> = {}
  const members = Object.entries(field.fields ?? {})
  for (const [name, spec] of members) {
    result[name] = coerceValue((value as Record<string, unknown>)[name], spec, `${path}.${name}`)
  }

  return result
}
