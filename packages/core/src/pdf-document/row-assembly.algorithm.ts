import type { PdfCell, PdfRow, PositionedText } from './pdf-document.model'

/** Runs closer than this share of the font size join into one cell. */
const JOIN_GAP = 0.35
/** Runs further apart than this share of the font size get a space between them when joined. */
const SPACE_GAP = 0.1
/** Runs on baselines closer than this share of the font size are on one line. */
const SAME_BASELINE = 0.2
/** A cell joins a row when this share of its height overlaps the row. */
const ROW_OVERLAP = 0.4

/**
 * Turns a page's text runs into rows of cells, top to bottom.
 *
 * Runs on one baseline that nearly touch become one cell. Cells whose vertical
 * extents overlap become one row, even when their baselines differ: a table
 * that centres its cells vertically puts a one-line value a few points above
 * or below its two-line label, and a row built from equal baselines would pair
 * the value with the wrong label.
 *
 * @param runs - The page's text runs, in any order.
 * @returns The rows.
 */
export function assembleRows (runs: readonly PositionedText[]): PdfRow[] {
  return rowsOfCells(joinCells(runs))
}

/**
 * Groups finished cells into rows, top to bottom: cells whose vertical extents
 * overlap share a row. For cells that need no joining, such as a slide's text
 * boxes, each already a cell.
 *
 * @param cells - The cells, in any order.
 * @returns The rows.
 */
export function rowsOfCells (cells: readonly PdfCell[]): PdfRow[] {
  const ordered = [...cells].sort((a, b) => middle(b) - middle(a) || a.x - b.x)
  const rows: PdfCell[][] = []
  let top = 0
  let bottom = 0
  for (const cell of ordered) {
    const current = rows.at(-1)
    const overlap = Math.min(cell.y + cell.height, top) - Math.max(cell.y, bottom)
    if (current !== undefined && overlap >= ROW_OVERLAP * cell.height) {
      current.push(cell)
      top = Math.max(top, cell.y + cell.height)
      bottom = Math.min(bottom, cell.y)
    } else {
      rows.push([cell])
      top = cell.y + cell.height
      bottom = cell.y
    }
  }

  return rows.map(row => rowOf(row))
}

function joinCells (runs: readonly PositionedText[]): PdfCell[] {
  // Whitespace runs are gaps, not text: pdf.js emits the space between two
  // table columns as one wide " ", which would bridge the columns.
  // Left to right within a line, lines top to bottom: a run may sit a fraction of a point off its neighbours' baseline.
  const ordered = runs.filter(run => run.text.trim() !== '').sort((a, b) => (Math.abs(a.y - b.y) <= SAME_BASELINE * Math.max(a.height, b.height, 1) ? a.x - b.x : b.y - a.y))
  const cells: PdfCell[] = []
  for (const run of ordered) {
    const previous = lastOf(cells, cell => Math.abs(cell.y - run.y) <= SAME_BASELINE * Math.max(cell.height, run.height, 1))
    const size = Math.max(run.height, previous?.height ?? 0, 1)
    const gap = previous === undefined ? Infinity : run.x - (previous.x + previous.width)
    if (previous !== undefined && gap <= JOIN_GAP * size && gap > -size) {
      const space = gap > SPACE_GAP * size && !/\s$/.test(previous.text) && !/^\s/.test(run.text) ? ' ' : ''
      previous.text += space + run.text
      previous.width = run.x + run.width - previous.x
      previous.height = Math.max(previous.height, run.height)
    } else {
      cells.push({ ...run })
    }
  }

  return cells.map(cell => ({ ...cell, text: cell.text.trim() })).filter(cell => cell.text !== '')
}

function rowOf (cells: PdfCell[]): PdfRow {
  const ordered = [...cells].sort((a, b) => a.x - b.x || b.y - a.y)

  return {
    top:    Math.max(...ordered.map(cell => cell.y + cell.height)),
    bottom: Math.min(...ordered.map(cell => cell.y)),
    cells:  ordered,
    text:   ordered.map(cell => cell.text).join('\t'),
  }
}

function middle (cell: PdfCell): number {
  return cell.y + cell.height / 2
}

/** `Array#findLast`, which the es2022 library does not declare. */
export function lastOf<T> (items: readonly T[], test: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) if (test(items[index])) return items[index]

  return undefined
}
