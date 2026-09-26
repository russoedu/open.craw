import { findTables, rowsOfCells } from '../pdf-document'
import type { PdfDocument, TableAlign } from '../pdf-document'
import { fillDown, findGridTables } from '../workbook-document'
import type { GridTableQuery, WorkbookCell } from '../workbook-document'
import type { DeckDocument, DeckSlide } from './deck-document.model'

/** What a table extract looks for in a deck. */
export interface DeckTableQuery extends Omit<GridTableQuery, 'sheet'> {
  /** Matches the titles of the slides to read; default every slide. */
  slide?:  RegExp
  /** Read text boxes laid out as a table instead of native tables. */
  shapes?: boolean
  /** With `shapes`: how a row's values sit against a box wrapped over several lines. */
  align?:  TableAlign
}

/** One table found in a deck. */
export interface DeckTable {
  /** The slide's number, from 1. */
  slide:      number
  slideTitle: string
  /** The first header cell. */
  title:      string
  header:     string[]
  rows:       Record<string, WorkbookCell>[]
}

/**
 * Finds tables in a deck: native tables through the workbook table reader
 * (merged cells filled, a header over several rows joined), or, with
 * `shapes`, text boxes laid out as a table through the PDF table reader (a box
 * is a cell, boxes whose heights overlap a row, columns from where the body's
 * boxes start). Hidden slides are skipped unless `includeHidden`.
 *
 * @param document - The deck.
 * @param query - Which tables, on which slides, and how to name their columns.
 * @returns The tables, slide by slide.
 */
export function findDeckTables (document: DeckDocument, query: DeckTableQuery): DeckTable[] {
  const slides = document.slides.filter(slide => (query.includeHidden === true || !slide.hidden) && (query.slide === undefined || query.slide.test(slide.title ?? '')))
  if (query.shapes === true) return shapeTables(document, slides, query)

  return slides.flatMap(slide => findGridTables({ kind: 'workbook', sheets: slide.tables }, query).map(table => ({
    slide:      slide.number,
    slideTitle: slide.title ?? '',
    title:      table.title,
    header:     table.header,
    rows:       table.rows,
  })))
}

/** Text boxes as a PDF of one page per slide, y flipped (PDF counts from the bottom), each box one cell. */
function shapeTables (document: DeckDocument, slides: readonly DeckSlide[], query: DeckTableQuery): DeckTable[] {
  const pdf: PdfDocument = {
    kind:  'pdf',
    pages: slides.map(slide => ({
      number: slide.number,
      width:  document.width,
      height: document.height,
      rows:   rowsOfCells(slide.shapes.map(shape => ({ x: shape.x, y: document.height - shape.y - shape.height, width: shape.width, height: shape.height, text: shape.text.replaceAll(/\s+/g, ' ').trim() }))),
    })),
  }
  const titles = new Map(slides.map(slide => [slide.number, slide.title ?? '']))

  return findTables(pdf, { header: query.header, until: query.until, columns: query.columns, align: query.align }).map(table => ({
    slide:      table.page,
    slideTitle: titles.get(table.page) ?? '',
    title:      table.title,
    header:     table.header,
    rows:       query.fillDown === undefined ? table.rows : fillDown(table.rows, query.fillDown),
  }))
}
