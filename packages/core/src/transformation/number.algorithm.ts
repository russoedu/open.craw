import { describe } from './string.algorithm'
import { TransformError } from './transform.error'

const DEFAULT_TRUTHY = ['true', 'yes', 'y', '1', 'on', 'in stock', 'available']

/**
 * The decimal and group separators a locale uses.
 *
 * @param locale - A BCP 47 tag; `undefined` means "guess from the text".
 * @returns The two separators.
 */
export function separatorsOf (locale: string): { decimal: string, group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
  const decimal = parts.find(part => part.type === 'decimal')?.value ?? '.'
  const group = parts.find(part => part.type === 'group')?.value ?? ','

  return { decimal, group }
}

/**
 * Parses a number from text, tolerating currency symbols, spaces and locale separators.
 *
 * @param value - Text or a number.
 * @param locale - The locale the text is written in. Without one, the last separator is the decimal one when
 * it is followed by 1 or 2 digits, otherwise it is a group separator.
 * @returns The number.
 * @throws TransformError when no number can be read.
 */
export function parseNumber (value: unknown, locale?: string): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') throw new TransformError('number', `expects text or a number, got ${describe(value)}`, value)
  const cleaned = value.replaceAll(/[^\d.,\-−+\u{A0}\u{202F} ]/gu, '').replaceAll(/[\u{A0}\u{202F} ]/gu, '').replace('−', '-').trim()
  if (cleaned === '') throw new TransformError('number', `no number in "${value}"`, value)
  const normalised = locale === undefined ? guessDecimal(cleaned) : withLocale(cleaned, locale)
  const parsed = Number(normalised)
  if (Number.isNaN(parsed)) throw new TransformError('number', `cannot read "${value}" as a number`, value)

  return parsed
}

function withLocale (text: string, locale: string): string {
  const { decimal, group } = separatorsOf(locale)
  const escapedGroup = group.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

  return text.replaceAll(new RegExp(escapedGroup, 'g'), '').replace(decimal, '.')
}

function guessDecimal (text: string): string {
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  const last = Math.max(lastDot, lastComma)
  if (last === -1) return text
  const digitsAfter = text.length - last - 1
  const separator = text[last]
  const isDecimal = digitsAfter > 0 && digitsAfter <= 2 && text.indexOf(separator) === last
  const withoutGroups = text.replaceAll(/[.,]/g, (mark, offset: number) => (isDecimal && offset === last ? '.' : ''))

  return withoutGroups
}

export function parseInteger (value: unknown, locale?: string): number {
  return Math.trunc(parseNumber(value, locale))
}

/**
 * Reads a boolean the way a recipe means it.
 *
 * @param value - Any value.
 * @param truthy - Phrases that mean `true` (case-insensitive, matched as a substring); default: yes/true/1/on/in stock/available.
 * @returns The boolean.
 */
export function parseBoolean (value: unknown, truthy: readonly string[] = DEFAULT_TRUTHY): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (value === null || value === undefined) return false
  const text = String(value).trim().toLowerCase()
  if (text === '') return false

  return truthy.some(phrase => text.includes(phrase.toLowerCase()))
}
