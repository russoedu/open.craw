import type { WorkbookCell, WorkbookDocument } from './workbook-document.model'

/**
 * Reads an `.xlsx` workbook into a workbook document, through
 * `@opencraw/office-reader`: every worksheet's cells, with hidden sheets,
 * hidden rows and merged ranges. Numbers and booleans keep their type (a
 * cell's `13955.625` is unambiguous; as text, a locale guess could read it as
 * thirteen million), dates become ISO text, errors their text, empty cells
 * `''`. Formulas give their cached value. The reader is imported on first use,
 * so recipes that never read a spreadsheet never load it.
 *
 * @param bytes - The file.
 * @param source - Where it came from, for messages.
 * @returns The workbook.
 * @throws Error naming the source, and saying what to do, for a file that is
 * not a readable workbook (a legacy `.xls`, a password-protected file, an `.ods`…).
 */
export async function readXlsxWorkbook (bytes: Uint8Array, source: string): Promise<WorkbookDocument> {
  const { readXlsx, OfficeReadError } = await import('@opencraw/office-reader/xlsx')
  try {
    const book = await readXlsx(bytes)

    return {
      kind:   'workbook',
      sheets: book.sheets.map(sheet => ({ name: sheet.name, rows: sheet.rows.map(row => row.map(cell => workbookCell(cell))), hidden: sheet.hidden, hiddenRows: sheet.hiddenRows, merges: sheet.merges })),
    }
  } catch (error) {
    if (error instanceof OfficeReadError) throw new Error(`${source}: ${error.message}`, { cause: error })
    throw error
  }
}

/** A typed spreadsheet value as a workbook cell. */
function workbookCell (value: string | number | boolean | Date | null | { error: string }): WorkbookCell {
  if (value === null) return ''
  if (value instanceof Date) return isoText(value)
  if (typeof value === 'object') return value.error

  return value
}

/** A date as ISO text: the day alone at midnight, the time alone for a time of day (Excel's day zero, 1899), both otherwise. */
function isoText (date: Date): string {
  const iso = date.toISOString()
  if (date.getUTCFullYear() < 1900) return iso.slice(11, 19)

  return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : iso.slice(0, 19)
}
