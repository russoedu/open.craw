import type { Sheet, WorkbookDocument } from './workbook-document.model'

/** What a table extract looks for in a workbook. */
export interface GridTableQuery {
  /** Matches a table's (first) header row: its non-empty cells joined by spaces, whitespace collapsed. */
  header:         RegExp
  /** Matches the row that ends a table; a table also ends at the next header or the sheet's end. `^$` ends it at the first empty row. */
  until?:         RegExp
  /** Output key -> a pattern for that column's header; unmatched columns are dropped. Without it, the headers are the keys. */
  columns?:       Record<string, RegExp>
  /** Matches the names of the sheets to read; default every sheet. */
  sheet?:         RegExp
  /** How many rows the header spans (default 1): a column's key joins its header texts. */
  headerRows?:    number
  /** Output keys whose empty cells take the value of the row above. */
  fillDown?:      string[]
  /** Read hidden sheets and hidden rows too. */
  includeHidden?: boolean
}

/** One table found in a workbook. */
export interface GridTable {
  sheet:  string
  /** The first header cell: the table's name when it has one. */
  title:  string
  /** The column keys, left to right. */
  header: string[]
  /** One object per row, keyed by column. */
  rows:   Record<string, string>[]
}

interface Column {
  index: number
  key:   string
}

/**
 * Finds every table whose header row matches, in every sheet the query
 * selects, and reads its rows by column. Unlike a PDF, a grid needs no
 * geometry: column *i* of a row belongs to header *i*.
 *
 * Merged ranges are filled first (the file stores their value in the top-left
 * cell only), so a brand merged down its models' rows reads on every row, and
 * a group header merged across its sub-columns names each of them. Empty rows
 * are skipped.
 *
 * @param document - The workbook.
 * @param query - Which tables, and how to name their columns.
 * @returns The tables, sheet by sheet, top to bottom.
 */
export function findGridTables (document: WorkbookDocument, query: GridTableQuery): GridTable[] {
  const tables: GridTable[] = []
  for (const sheet of document.sheets) {
    if (sheet.hidden === true && query.includeHidden !== true) continue
    if (query.sheet !== undefined && !query.sheet.test(sheet.name)) continue
    tables.push(...sheetTables(sheet, query))
  }

  return tables
}

/**
 * Fills blank cells in the given columns with the value of the row above,
 * within one table: pivot exports write a group's name on its first row only.
 *
 * @param rows - The table's rows, in order.
 * @param keys - The columns to fill.
 * @returns The rows, filled (new objects; the input is not changed).
 */
export function fillDown (rows: readonly Record<string, string>[], keys: readonly string[]): Record<string, string>[] {
  const last = new Map<string, string>()

  return rows.map((row) => {
    const filled = { ...row }
    for (const key of keys) {
      const value = filled[key]
      if (value === undefined || value === '') {
        const above = last.get(key)
        if (above !== undefined) filled[key] = above
      } else {
        last.set(key, value)
      }
    }

    return filled
  })
}

function sheetTables (sheet: Sheet, query: GridTableQuery): GridTable[] {
  const hidden = new Set(query.includeHidden === true ? [] : sheet.hiddenRows)
  const visible = sheet.rows.flatMap((_row, index) => (hidden.has(index) ? [] : [index]))
  const grid = filledGrid(sheet)
  const plainRows = new Map(visible.map(index => [index, plain(sheet.rows[index])]))
  const starts = visible.filter(index => plainRows.get(index) !== '' && query.header.test(plainRows.get(index) ?? ''))
  const headerRows = query.headerRows ?? 1

  return starts.map((start, position) => {
    const at = visible.indexOf(start)
    const headerIndexes = visible.slice(at, at + headerRows)
    const next = starts[position + 1] ?? Infinity
    const body: number[] = []
    const below = visible.slice(at + headerRows)
    for (const index of below) {
      if (index >= next) break
      if (query.until?.test(plainRows.get(index) ?? '') === true) break
      if (plainRows.get(index) !== '') body.push(index)
    }
    const columns = columnsOf(grid, headerIndexes, body)
    const rows = body.map(index => named(grid[index] ?? [], columns, query.columns))

    return {
      sheet:  sheet.name,
      title:  sheet.rows[start].map(text => clean(text)).find(text => text !== '') ?? '',
      header: columns.map(column => column.key),
      rows:   query.fillDown === undefined ? rows : fillDown(rows, query.fillDown),
    }
  })
}

/**
 * The table's columns: each column's key joins the distinct texts its header
 * rows hold (`Insgesamt` over `August 2026` gives `Insgesamt August 2026`). A
 * column with no header text but data below is keyed by its letter (`A`); one
 * with neither is dropped. A key seen before gets a counter (`Price 2`).
 */
function columnsOf (grid: readonly string[][], headerIndexes: readonly number[], body: readonly number[]): Column[] {
  const width = Math.max(0, ...[...headerIndexes, ...body].map(index => grid[index]?.length ?? 0))
  const seen = new Map<string, number>()
  const columns: Column[] = []
  for (let index = 0; index < width; index += 1) {
    const parts: string[] = []
    for (const row of headerIndexes) {
      const text = clean(grid[row]?.[index] ?? '')
      if (text !== '' && !parts.includes(text)) parts.push(text)
    }
    const hasData = body.some(row => (grid[row]?.[index] ?? '').trim() !== '')
    if (!hasData && parts.length === 0) continue
    const base = parts.length === 0 ? columnLetter(index) : parts.join(' ')
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    columns.push({ index, key: count === 1 ? base : `${base} ${count}` })
  }

  return columns
}

function named (row: readonly string[], columns: readonly Column[], patterns: Record<string, RegExp> | undefined): Record<string, string> {
  const value = (column: Column): string => (row[column.index] ?? '').trim()
  if (patterns === undefined) return Object.fromEntries(columns.map(column => [column.key, value(column)]))
  const record: Record<string, string> = {}
  for (const [key, pattern] of Object.entries(patterns)) {
    const column = columns.find(candidate => pattern.test(candidate.key))
    if (column !== undefined) record[key] = value(column)
  }

  return record
}

/** The sheet's rows with every merged range's value copied into the cells it covers. */
function filledGrid (sheet: Sheet): string[][] {
  if (sheet.merges === undefined || sheet.merges.length === 0) return sheet.rows
  const grid = sheet.rows.map(row => [...row])
  for (const reference of sheet.merges) {
    const range = rangeOf(reference)
    if (range === undefined) continue
    const value = sheet.rows[range.top]?.[range.left] ?? ''
    for (let row = range.top; row <= range.bottom; row += 1) {
      grid[row] ??= []
      for (let column = range.left; column <= range.right; column += 1) grid[row][column] = value
    }
  }

  return grid
}

/** `B10:B13` as 0-based bounds; `undefined` for anything else. */
function rangeOf (reference: string): { top: number, left: number, bottom: number, right: number } | undefined {
  const [from, to = from] = reference.split(':', 2)
  const start = cellOf(from)
  const end = cellOf(to)
  if (start === undefined || end === undefined) return undefined

  return { top: Math.min(start.row, end.row), left: Math.min(start.column, end.column), bottom: Math.max(start.row, end.row), right: Math.max(start.column, end.column) }
}

function cellOf (reference: string): { row: number, column: number } | undefined {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(reference.trim())
  if (match === null) return undefined
  const letters = match[1].toUpperCase()
  let column = 0
  for (const char of letters) column = column * 26 + (char.codePointAt(0) ?? 64) - 64

  return { row: Number(match[2]) - 1, column: column - 1 }
}

/** `0` → `A`, `25` → `Z`, `26` → `AA`. */
function columnLetter (index: number): string {
  let letters = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCodePoint(65 + ((rest - 1) % 26)) + letters

  return letters
}

/** A row as a header pattern sees it: its non-empty cells, whitespace collapsed, joined by spaces. */
function plain (row: readonly string[] | undefined): string {
  return (row ?? []).map(text => clean(text)).filter(text => text !== '').join(' ')
}

function clean (text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}
