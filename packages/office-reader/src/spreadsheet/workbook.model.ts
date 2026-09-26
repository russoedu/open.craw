/**
 * A cell as `values: 'typed'` reads it: text, a number, a boolean, a date
 * (a `Date` holding the wall-clock time as UTC: spreadsheets have no time
 * zones), `null` when empty, or an error (`#DIV/0!`).
 */
export type CellValue = string | number | boolean | Date | null | { error: string }

/** One worksheet: its cells as stored, plus what a person sees differently (hidden rows, merged ranges). */
export interface Sheet<Cell = CellValue> {
  name:       string
  /** Hidden or very hidden in the workbook. */
  hidden:     boolean
  /** Top to bottom from row 1; each row runs to its last stored cell (rows can be ragged). */
  rows:       Cell[][]
  /** Hidden rows, 0-based. */
  hiddenRows: number[]
  /** Merged ranges as A1 references (`B10:B13`); a range's value sits in its top-left cell only, as the file stores it. */
  merges:     string[]
}

/** A workbook read into sheets. */
export interface Workbook<Cell = CellValue> {
  /** Whether the workbook counts dates from 1904 (old Mac Excel) instead of 1900. */
  date1904: boolean
  /** The worksheets, in workbook order (chart sheets are left out). */
  sheets:   Sheet<Cell>[]
}

/** `typed`: numbers, booleans, dates as values; `text`: every cell as canonical text. */
export type ValueMode = 'typed' | 'text'

/** Which sheets to read: a name, a pattern, or a test. Unselected sheets are never inflated. */
export type SheetFilter = string | RegExp | ((sheet: { name: string, hidden: boolean }) => boolean)
