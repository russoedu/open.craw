/** One sheet of a workbook: a grid of cells as text. A CSV is a workbook of one sheet. */
export interface Sheet {
  name:        string
  /** Top to bottom; a row holds as many cells as were read (rows can be ragged). */
  rows:        string[][]
  /** A sheet hidden in the workbook: `table` skips it unless `includeHidden`. */
  hidden?:     boolean
  /** Rows hidden in the sheet (0-based): `table` skips them unless `includeHidden`. */
  hiddenRows?: number[]
  /**
   * Merged ranges as A1 references (`B10:B13`). The value of a merged range
   * sits in its top-left cell only, as the file stores it; `table` copies it
   * into every cell the range covers.
   */
  merges?:     string[]
}

/** How a CSV was read, for a probe to report. */
export interface CsvFormat {
  encoding:  string
  delimiter: string
}

/** A spreadsheet or a CSV read into sheets of text cells: what `extract` works on. */
export interface WorkbookDocument {
  kind:   'workbook'
  sheets: Sheet[]
  /** Present when the workbook came from a CSV. */
  csv?:   CsvFormat
}

/**
 * The text a `regex` extract reads: the visible rows of the visible sheets,
 * cells separated by a tab, sheets separated by a blank line.
 *
 * @param document - The workbook.
 * @returns The text.
 */
export function workbookText (document: WorkbookDocument): string {
  return document.sheets
    .filter(sheet => sheet.hidden !== true)
    .map(sheet => visibleRows(sheet).map(row => row.join('\t')).join('\n'))
    .join('\n\n')
}

/**
 * Whether a value bound in scope is a read workbook (so `extract … from` can take it).
 *
 * @param value - Anything.
 * @returns Whether it is a {@link WorkbookDocument}.
 */
export function isWorkbookDocument (value: unknown): value is WorkbookDocument {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'workbook' && Array.isArray((value as { sheets?: unknown }).sheets)
}

function visibleRows (sheet: Sheet): string[][] {
  if (sheet.hiddenRows === undefined || sheet.hiddenRows.length === 0) return sheet.rows
  const hidden = new Set(sheet.hiddenRows)

  return sheet.rows.filter((_row, index) => !hidden.has(index))
}
