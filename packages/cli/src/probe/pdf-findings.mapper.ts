import type { PdfDocument, PdfRow } from '@opencraw/core'

/** Rows shown in a probe, at most. */
const ROW_LIMIT = 80

/** What a probe shows of a PDF: its rows, and the rows that look like table headers. */
export interface PdfFindings {
  pages:   number
  /** The first rows, cells separated by " | ". */
  rows:    { page: number, text: string }[]
  /** Rows of text cells (no digit) with a row of data (a digit) right under them: likely table headers, with a selector that finds them. */
  headers: { page: number, text: string, selector: string }[]
}

/**
 * Summarises a PDF for someone writing a recipe: what the rows look like, and
 * where the tables start, so a `table` extract's selector and columns can be
 * read off the result instead of guessed.
 *
 * @param document - The read PDF.
 * @returns The findings.
 */
export function describePdf (document: PdfDocument): PdfFindings {
  const rows = document.pages.flatMap(page => page.rows.map((row, index) => ({ page: page.number, row, next: page.rows.slice(index + 1, index + 3) })))
  const headers = rows.filter(({ row, next }) => row.cells.length >= 2 && row.cells.every(cell => !/\d/.test(cell.text)) && next.some(candidate => dataRow(candidate)))

  return {
    pages:   document.pages.length,
    rows:    rows.slice(0, ROW_LIMIT).map(({ page, row }) => ({ page, text: row.cells.map(cell => cell.text).join(' | ') })),
    headers: headers.map(({ page, row }) => ({ page, text: row.cells.map(cell => cell.text).join(' | '), selector: `^${escape(row.cells[0].text)}` })),
  }
}

/** A row of at least two cells, one with a digit: data, not a heading. */
function dataRow (row: PdfRow): boolean {
  return row.cells.length >= 2 && row.cells.some(cell => /\d/.test(cell.text))
}

function escape (text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}
