import { describe } from './string.algorithm'
import { TransformError } from './transform.error'

const TOKENS: Record<string, string> = { YYYY: String.raw`(?<year>\d{4})`, MM: String.raw`(?<month>\d{1,2})`, DD: String.raw`(?<day>\d{1,2})`, HH: String.raw`(?<hour>\d{1,2})`, mm: String.raw`(?<minute>\d{1,2})`, ss: String.raw`(?<second>\d{1,2})` }
const TOKEN = /YYYY|MM|DD|HH|mm|ss/g

/**
 * Parses a date or instant.
 *
 * @param value - Text, a number (epoch milliseconds) or a Date.
 * @param format - Tokens `YYYY MM DD HH mm ss`, e.g. `DD/MM/YYYY`; without one the text must be ISO 8601 or otherwise `Date.parse`-able.
 * @param timezone - An IANA zone the text is written in when it carries no offset; default UTC.
 * @returns The instant.
 * @throws TransformError when the text cannot be read.
 */
export function parseDate (value: unknown, format?: string, timezone?: string): Date {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value !== 'string') throw new TransformError('date', `expects text, got ${describe(value)}`, value)
  const text = value.trim()
  const parsed = format === undefined ? parseIso(text, timezone) : parseWithFormat(text, format, timezone)
  if (parsed === undefined || Number.isNaN(parsed.getTime())) throw new TransformError('date', `cannot read "${value}" as a date${format === undefined ? '' : ` with format ${format}`}`, value)

  return parsed
}

/** `YYYY-MM-DD` of an instant, in UTC. */
export function toIsoDate (date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseIso (text: string, timezone: string | undefined): Date | undefined {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text)
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  if (dateOnly || hasOffset || timezone === undefined) return new Date(text)
  const local = new Date(`${text}Z`)

  return Number.isNaN(local.getTime()) ? undefined : shiftFromZone(local, timezone)
}

function parseWithFormat (text: string, format: string, timezone: string | undefined): Date | undefined {
  const escaped = format.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`)
  const source = escaped.replaceAll(TOKEN, token => TOKENS[token])
  const match = new RegExp(`^${source}$`).exec(text)
  if (match?.groups === undefined) return undefined
  const { year, month = '1', day = '1', hour = '0', minute = '0', second = '0' } = match.groups
  if (year === undefined) return undefined
  const fields = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)]
  const utc = new Date(Date.UTC(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5]))
  const actual = [utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds()]
  if (actual.some((part, index) => part !== fields[index])) return undefined

  return timezone === undefined ? utc : shiftFromZone(utc, timezone)
}

/**
 * Reinterprets a wall-clock time (built as if it were UTC) as a time in a zone.
 *
 * @param wallClock - The instant whose UTC fields are the wall-clock fields.
 * @param timezone - An IANA zone.
 * @returns The real instant.
 */
function shiftFromZone (wallClock: Date, timezone: string): Date {
  const offset = offsetOf(wallClock, timezone)
  const guess = new Date(wallClock.getTime() - offset)
  const corrected = offsetOf(guess, timezone)

  return corrected === offset ? guess : new Date(wallClock.getTime() - corrected)
}

function offsetOf (instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant)
  const field = (type: string): number => Number(parts.find(part => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'))

  return asUtc - instant.getTime()
}
