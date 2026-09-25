import type { PdfCell, PdfDocument, PdfRow } from './pdf-document.model'
import { lastOf } from './row-assembly.algorithm'

/** What a table extract looks for. */
export interface TableQuery {
  /** Matches a table's header row, its cells joined by spaces (`^MODELLI`). */
  header:   RegExp
  /** Matches the row that ends a table (`^NOTA BENE`); a table also ends at the next header or the page's end. */
  until?:   RegExp
  /** Output key -> a pattern for the header cell of that column; unmatched columns are dropped. Without it, the header texts are the keys. */
  columns?: Record<string, RegExp>
  /** How the table aligns a row's values against a cell wrapped over several lines; `auto` (the default) infers it. */
  align?:   TableAlign
}

/** Where a row's values sit against a cell wrapped over several lines. */
export type TableAlign = 'auto' | 'top' | 'center' | 'bottom'

/** One table found in a PDF. */
export interface PdfTable {
  page:   number
  /** The first header cell: the table's name when it has one (`MODELLI FIAT`). */
  title:  string
  /** The header cells, left to right. */
  header: string[]
  /** One object per row, keyed by column; a cell's lines are joined by spaces. */
  rows:   Record<string, string>[]
}

interface Band {
  start:  number
  column: number
}

/**
 * Finds every table whose header row matches, and reads its rows by column.
 *
 * Columns come from the body, not the header: a header is often centred over
 * a column whose cells are left-aligned, so the header's position says little
 * about where the column starts. The left edges of the body cells cluster into
 * bands; each band belongs to the header cell that overlaps it most, or the
 * nearest one when none does. A header spanning two columns reads both.
 *
 * A cell wrapped over several lines (a long name, a note, a list of versions)
 * spreads one row over several lines, its values often centred beside it:
 * the lines are regrouped into rows around the lines that carry values.
 *
 * @param document - The PDF.
 * @param query - Which tables, and how to name their columns.
 * @returns The tables, in page order.
 */
export function findTables (document: PdfDocument, query: TableQuery): PdfTable[] {
  const tables: PdfTable[] = []
  for (const page of document.pages) {
    const starts = page.rows.flatMap((row, index) => (query.header.test(plain(row)) ? [index] : []))
    for (const [position, start] of starts.entries()) {
      const body = bodyOf(page.rows.slice(start + 1, starts[position + 1] ?? page.rows.length), query.until)
      tables.push(readTable(page.number, page.rows[start], body, query))
    }
  }

  return tables
}

/** The rows under a header, up to the first one `until` matches. */
function bodyOf (rows: readonly PdfRow[], until: RegExp | undefined): PdfRow[] {
  const end = until === undefined ? -1 : rows.findIndex(row => until.test(plain(row)))

  return end === -1 ? [...rows] : rows.slice(0, end)
}

function readTable (page: number, headerRow: PdfRow, body: readonly PdfRow[], query: TableQuery): PdfTable {
  const headers = headerCells(headerRow)
  const bands = bandsOf(body, headers)
  const lines = body.map(row => ({ row, values: valuesOf(row, bands, headers.length) }))
  const groups = groupLines(lines, query.align ?? 'auto')

  return {
    page,
    title:  headers[0]?.text ?? '',
    header: headers.map(header => header.text),
    rows:   groups.map(group => named(joinLines(group, headers.length), headers, query.columns)),
  }
}

interface Line {
  row:    PdfRow
  values: string[]
}

/**
 * Groups the body's lines into table rows. A line anchors a row when it has a
 * name (the first column) and a value, or, without a name, a value in the
 * first value column: the middle line of a name wrapped over several lines,
 * the values centred beside it. Every other line (a wrapped name, a wrapped
 * note, a list of versions over two lines) joins an anchor:
 *
 * - `top`: the nearest anchor above it; `bottom`: the nearest below;
 * - `center`: a wrapped name splits evenly around its anchor (as many lines
 *   below as above), and other lines join the nearest anchor;
 * - `auto`: `center` when some line carries values but no name (only a
 *   centred table does that), else the nearest anchor, a tie going to the one
 *   below (a wrapped cell's first line comes before its row).
 */
function groupLines (lines: readonly Line[], align: TableAlign): Line[][] {
  const named = (line: Line): boolean => line.values[0] !== ''
  const valued = (line: Line): boolean => line.values.slice(1).some(value => value !== '')
  let anchors = lines.filter(line => (named(line) && valued(line)) || (!named(line) && (line.values[1] ?? '') !== ''))
  if (anchors.length === 0) anchors = lines.filter(line => named(line))
  if (anchors.length === 0) return []
  const groups = new Map<Line, Line[]>(anchors.map(anchor => [anchor, [anchor]]))
  const centred = align === 'center' || (align === 'auto' && anchors.some(anchor => !named(anchor)))
  if (centred) splitNamesEvenly(lines, anchors, named, groups)
  const placed = new Set<Line>()
  for (const members of groups.values()) for (const line of members) placed.add(line)
  for (const line of lines) if (!placed.has(line)) groups.get(ownerOf(line, anchors, align))?.push(line)
  // An anchor that ended up with no name at all is a value spilling out of the row next to it.
  const nameless = anchors.filter(anchor => (groups.get(anchor) ?? []).every(line => !named(line)))
  const kept = anchors.filter(anchor => !nameless.includes(anchor))
  if (kept.length === 0) return []
  for (const anchor of nameless) groups.get(nearest(anchor, kept))?.push(...(groups.get(anchor) ?? []))

  return kept.map(anchor => groups.get(anchor) ?? [])
}

/**
 * Hands the wrapped name lines between two anchors out evenly: the upper
 * anchor takes as many lines below it as it took above it, the lower one the
 * rest. Lines are in page order, top to bottom.
 */
function splitNamesEvenly (lines: readonly Line[], anchors: readonly Line[], named: (line: Line) => boolean, groups: Map<Line, Line[]>): void {
  const positions = anchors.map(anchor => lines.indexOf(anchor))
  const namesBetween = (from: number, to: number): Line[] => lines.slice(from, to).filter(line => named(line) && !groups.has(line))
  let above = namesBetween(0, positions[0])
  groups.get(anchors[0])?.push(...above)
  for (const [index, anchor] of anchors.entries()) {
    const next = anchors[index + 1]
    const run = namesBetween(positions[index] + 1, next === undefined ? lines.length : positions[index + 1])
    const taken = next === undefined ? run.length : Math.min(run.length, above.length)
    groups.get(anchor)?.push(...run.slice(0, taken))
    above = run.slice(taken)
    if (next !== undefined) groups.get(next)?.push(...above)
  }
}

function ownerOf (line: Line, anchors: readonly Line[], align: TableAlign): Line {
  if (align === 'top') return lastOf(anchors, anchor => anchor.row.bottom >= line.row.bottom) ?? anchors[0]
  if (align === 'bottom') return anchors.find(anchor => anchor.row.bottom <= line.row.bottom) ?? anchors.at(-1) ?? anchors[0]

  return nearest(line, anchors)
}

/** A row's text per column: its lines top to bottom, each column's pieces joined by spaces. */
function joinLines (group: readonly Line[], width: number): string[] {
  const ordered = [...group].sort((a, b) => b.row.top - a.row.top)

  return Array.from({ length: width }, (_, column) => ordered.map(line => line.values[column]).filter(value => value !== '').join(' '))
}

/** Header cells that overlap horizontally (a header on two lines) are one header. */
function headerCells (row: PdfRow): PdfCell[] {
  const merged: PdfCell[] = []
  for (const cell of row.cells) {
    const previous = merged.at(-1)
    if (previous !== undefined && cell.x < previous.x + previous.width) {
      previous.text = `${previous.text} ${cell.text}`
      previous.width = Math.max(previous.x + previous.width, cell.x + cell.width) - previous.x
    } else {
      merged.push({ ...cell })
    }
  }

  return merged
}

function bandsOf (body: readonly PdfRow[], headers: readonly PdfCell[]): Band[] {
  const cells = body.flatMap(row => row.cells)
  if (cells.length === 0 || headers.length === 0) return []
  const tolerance = Math.max(3, median(cells.map(cell => cell.height)) * 0.6)
  const edges = cells.map(cell => cell.x).sort((a, b) => a - b)
  const starts: number[] = []
  for (const edge of edges) if (starts.length === 0 || edge - (starts.at(-1) ?? 0) > tolerance) starts.push(edge)
  const spans = starts.map((start, index) => {
    const next = starts[index + 1] ?? Infinity
    // A band spans what its cells cover, not the gap up to the next band.
    const right = Math.max(...cells.filter(cell => cell.x >= start - 0.5 && cell.x < next - 0.5).map(cell => cell.x + cell.width))

    return { start, end: Math.min(next, right) }
  })
  const columns = assignColumns(spans, headers)

  return spans.map((span, index) => ({ start: span.start, column: columns[index] }))
}

/**
 * Maps bands to headers, left to right: columns never cross, so the mapping
 * is monotone. Among monotone mappings it first uses as many headers as it
 * can (a table with as many bands as headers maps one to one), then prefers
 * the one where bands overlap their header most, or sit nearest to it. The
 * leftover choice is which neighbouring bands share a header: one header
 * over two columns, or a column whose cells start at two edges.
 *
 * @param spans - The bands, left to right.
 * @param headers - The header cells, left to right.
 * @returns The header index of each band.
 */
function assignColumns (spans: readonly { start: number, end: number }[], headers: readonly PdfCell[]): number[] {
  interface Score { used: number, affinity: number, previous: number }
  const affinity = (span: { start: number, end: number }, header: PdfCell): number => {
    const overlap = overlapOf(header, span)

    return overlap > 0 ? overlap : -Math.max(0, header.x - span.end, span.start - (header.x + header.width))
  }
  const better = (a: Score, b: Score | undefined): boolean => b === undefined || a.used > b.used || (a.used === b.used && a.affinity > b.affinity)
  const table: Score[][] = [headers.map(header => ({ used: 1, affinity: affinity(spans[0], header), previous: -1 }))]
  for (const span of spans.slice(1)) {
    const last = table.at(-1) ?? []
    table.push(headers.map((header, column) => {
      let best: Score | undefined
      for (let from = 0; from <= column; from += 1) {
        const candidate = { used: last[from].used + (from === column ? 0 : 1), affinity: last[from].affinity + affinity(span, header), previous: from }
        if (better(candidate, best)) best = candidate
      }

      return best ?? { used: 0, affinity: -Infinity, previous: 0 }
    }))
  }
  const last = table.at(-1) ?? []
  let column = last.reduce((best, score, index) => (better(score, last[best]) ? index : best), 0)
  const columns: number[] = []
  for (let index = table.length - 1; index >= 0; index -= 1) {
    columns.unshift(column)
    column = table[index][column].previous
  }

  return columns
}

function valuesOf (row: PdfRow, bands: readonly Band[], width: number): string[] {
  const values = Array.from({ length: width }, () => '')
  const ordered = [...row.cells].sort((a, b) => b.y - a.y || a.x - b.x)
  for (const cell of ordered) {
    const band = lastOf(bands, candidate => candidate.start <= cell.x + 0.5) ?? bands[0]
    if (band === undefined) continue
    values[band.column] = joinText(values[band.column], cell.text)
  }

  return values
}

function named (values: readonly string[], headers: readonly PdfCell[], columns: Record<string, RegExp> | undefined): Record<string, string> {
  if (columns === undefined) return Object.fromEntries(headers.map((header, index) => [header.text, values[index]]))
  const record: Record<string, string> = {}
  for (const [key, pattern] of Object.entries(columns)) {
    const index = headers.findIndex(header => pattern.test(header.text))
    if (index !== -1) record[key] = values[index]
  }

  return record
}

/** Distances closer than this, in points, are a tie. */
const TIE = 1

/**
 * The anchor a line belongs to: the nearest by vertical gap. On a tie (evenly
 * spaced lines) the anchor below wins: text reads top down, so a wrapped
 * cell's first line comes before the row it belongs to.
 */
function nearest<T extends { row: PdfRow }> (line: { row: PdfRow }, candidates: readonly T[]): T {
  const row = line.row
  const gap = (candidate: PdfRow): number => Math.max(0, candidate.bottom - row.top, row.bottom - candidate.top)
  const [first, ...rest] = candidates
  if (first === undefined) throw new Error('no row to attach a line to')
  let best = first
  for (const candidate of rest) {
    const difference = gap(candidate.row) - gap(best.row)
    if (difference < -TIE || (Math.abs(difference) <= TIE && candidate.row.bottom < best.row.bottom)) best = candidate
  }

  return best
}

function overlapOf (header: PdfCell, band: { start: number, end: number }): number {
  return Math.max(0, Math.min(header.x + header.width, band.end) - Math.max(header.x, band.start))
}

function plain (row: PdfRow): string {
  return row.cells.map(cell => cell.text).join(' ')
}

function joinText (first: string, second: string): string {
  return first === '' ? second : (second === '' ? first : `${first} ${second}`)
}

function median (values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b)

  return ordered[Math.floor(ordered.length / 2)] ?? 0
}
