import type { CellValue, ValueMode } from './workbook.model'

/** A cell as the sheet stores it. */
export interface StoredCell {
  /** The `t` attribute: `n` (default), `s`, `str`, `inlineStr`, `b`, `e`, `d`. */
  type:   string
  /** The `<v>` text, or the inline string. */
  value:  string
  /** How its number format reads it. */
  format: NumberFormatKind
}

/** What a number format makes of a number: a date, a time of day, or a plain number. */
export type NumberFormatKind = 'number' | 'date' | 'time'

/** What reading a cell needs besides the cell. */
export interface CellContext {
  sharedStrings: readonly string[]
  date1904:      boolean
}

const MS_PER_DAY = 86_400_000
/** 1970-01-01 as a 1900-system serial number. */
const UNIX_EPOCH_SERIAL = 25_569
/** Days between the 1900 and the 1904 systems' day zero. */
const DAYS_1904 = 1462

/**
 * A stored cell as a typed value.
 *
 * @param cell - The cell.
 * @param context - Shared strings and the date system.
 * @returns The value; `null` for an empty cell.
 */
export function typedValue (cell: StoredCell, context: CellContext): CellValue {
  switch (cell.type) {
    case 's': {
      return context.sharedStrings[Number(cell.value)] ?? ''
    }
    case 'str':
    case 'inlineStr': {
      return cell.value
    }
    case 'b': {
      return cell.value === '1' || cell.value === 'true'
    }
    case 'e': {
      return { error: cell.value }
    }
    case 'd': {
      const date = new Date(cell.value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(cell.value) ? cell.value : `${cell.value}Z`)

      return Number.isNaN(date.getTime()) ? cell.value : date
    }
    default: {
      if (cell.value.trim() === '') return null
      const number = Number(cell.value)
      if (Number.isNaN(number)) return cell.value

      return cell.format === 'number' ? number : dateOf(number, context.date1904)
    }
  }
}

/**
 * A stored cell as canonical text: numbers in their shortest round-trip form
 * (`78.6`, not `78.599999999999994`), dates as ISO (`2026-06-01`, or
 * `2026-06-01T09:30:00` with a time, `09:30:00` for a time of day), booleans
 * as `true`/`false`, errors as written, `''` when empty. Display formats are
 * not applied: a percentage stays a fraction (`0.125`).
 *
 * @param cell - The cell.
 * @param context - Shared strings and the date system.
 * @returns The text.
 */
export function textValue (cell: StoredCell, context: CellContext): string {
  const value = typedValue(cell, context)
  if (value === null) return ''
  if (value instanceof Date) return isoText(value, cell.format === 'time' && Number(cell.value) < 1)
  if (typeof value === 'object') return value.error

  return String(value)
}

/**
 * Reads a cell in the mode asked for.
 *
 * @param cell - The cell.
 * @param context - Shared strings and the date system.
 * @param mode - `typed` or `text`.
 * @returns The value.
 */
export function cellValue (cell: StoredCell, context: CellContext, mode: ValueMode): CellValue {
  return mode === 'text' ? textValue(cell, context) : typedValue(cell, context)
}

/**
 * A serial date as a `Date` holding the wall-clock time as UTC, rounded to the
 * second. The 1900 system counts the 29th of February 1900 that never was
 * (Lotus's bug, kept for compatibility): serials before it are a day early.
 */
function dateOf (serial: number, date1904: boolean): Date {
  let days = date1904 ? serial + DAYS_1904 : serial
  if (!date1904 && serial >= 1 && serial < 60) days += 1
  const seconds = Math.round((days - UNIX_EPOCH_SERIAL) * (MS_PER_DAY / 1000))

  return new Date(seconds * 1000)
}

function isoText (date: Date, timeOfDay: boolean): string {
  const iso = date.toISOString()
  if (timeOfDay) return iso.slice(11, 19)

  return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : iso.slice(0, 19)
}
