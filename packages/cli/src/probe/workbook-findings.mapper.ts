import type { Sheet, WorkbookDocument } from '@opencraw/core'

/** Rows shown per sheet in a probe, at most. */
const ROW_LIMIT = 20
/** How far below a header row a probe looks for the first data row. */
const LOOKAHEAD = 3

/** What a probe shows of a workbook (a spreadsheet or a CSV). */
export interface WorkbookFindings {
  /** How a CSV was read. */
  csv?:    { encoding: string, delimiter: string }
  sheets:  { name: string, hidden: boolean, rows: number, columns: number }[]
  /** The first non-empty rows of each visible sheet, cells separated by " | ". */
  rows:    { sheet: string, row: number, text: string }[]
  /**
   * Rows of text cells (no digit) with a data row (a digit) just below: likely
   * table headers, with the `sheet` and `selector` a `table` extract needs, and
   * a hint when the header has merged cells (a header over two rows).
   */
  headers: { sheet: string, row: number, text: string, selector: string, hint?: string }[]
}

/**
 * Summarises a workbook for someone writing a recipe: its sheets, what their
 * rows look like and where the tables start, so a `table` extract's `sheet`,
 * `selector` and columns can be read off the result instead of guessed.
 *
 * @param document - The read workbook.
 * @returns The findings.
 */
export function describeWorkbook (document: WorkbookDocument): WorkbookFindings {
  const visible = document.sheets.filter(sheet => sheet.hidden !== true)

  return {
    ...(document.csv !== undefined && { csv: document.csv }),
    sheets:  document.sheets.map(sheet => ({ name: sheet.name, hidden: sheet.hidden === true, rows: sheet.rows.length, columns: Math.max(0, ...sheet.rows.map(row => row.length)) })),
    rows:    visible.flatMap(sheet => filledRows(sheet).slice(0, ROW_LIMIT).map(({ index, cells }) => ({ sheet: sheet.name, row: index + 1, text: cells.join(' | ') }))),
    headers: visible.flatMap(sheet => headersOf(sheet)),
  }
}

function headersOf (sheet: Sheet): WorkbookFindings['headers'] {
  const rows = filledRows(sheet)
  const merged = mergedRows(sheet)

  return rows.flatMap(({ index, cells }, position) => {
    if (cells.length < 2 || cells.some(cell => /\d/.test(cell))) return []
    if (rows.slice(position + 1, position + 1 + LOOKAHEAD).every(row => !(row.cells.length >= 2 && row.cells.some(cell => /\d/.test(cell))))) return []
    const header = { sheet: sheet.name, row: index + 1, text: cells.join(' | '), selector: `^${escape(cells[0])}` }

    return [merged.has(index) ? { ...header, hint: 'merged header cells: try "headerRows": 2' } : header]
  })
}

/** The non-empty rows, as their non-empty cells, whitespace collapsed. */
function filledRows (sheet: Sheet): { index: number, cells: string[] }[] {
  const hidden = new Set(sheet.hiddenRows)

  return sheet.rows.flatMap((row, index) => {
    const cells = row.map(cell => String(cell).replaceAll(/\s+/g, ' ').trim()).filter(cell => cell !== '')

    return cells.length === 0 || hidden.has(index) ? [] : [{ index, cells }]
  })
}

/** Rows a merged range starts on. */
function mergedRows (sheet: Sheet): Set<number> {
  const rows = new Set<number>()
  const merges = sheet.merges ?? []
  for (const reference of merges) {
    const match = /^\$?[A-Z]+\$?(\d+)/i.exec(reference)
    if (match !== null) rows.add(Number(match[1]) - 1)
  }

  return rows
}

function escape (text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}
