import type { Sheet } from '../workbook-document'

/** A text box on a slide, in points from the slide's top-left corner. */
export interface DeckShape {
  x:            number
  y:            number
  width:        number
  height:       number
  text:         string
  /** The placeholder it fills (`title`, `body`…). */
  placeholder?: string
}

/** A chart's data, from the values the chart caches. */
export interface DeckChart {
  type:   string
  title?: string
  series: { name: string, categories: string[], values: (number | null)[] }[]
}

/** One slide. */
export interface DeckSlide {
  number: number
  title?: string
  hidden: boolean
  /** Text boxes in reading order. */
  shapes: DeckShape[]
  /** Native tables, as sheets (`table 1`…) with their merged cells. */
  tables: Sheet[]
  charts: DeckChart[]
  notes:  string
}

/** A presentation read into slides: what `extract` works on. */
export interface DeckDocument {
  kind:   'deck'
  /** The slide size, in points. */
  width:  number
  height: number
  slides: DeckSlide[]
}

/**
 * The text a `regex` extract reads: per visible slide, its title, its text
 * boxes in reading order, its tables' rows (cells separated by a tab) and its
 * notes after `Notes:`; slides separated by a blank line.
 *
 * @param document - The deck.
 * @returns The text.
 */
export function deckText (document: DeckDocument): string {
  return document.slides
    .filter(slide => !slide.hidden)
    .map(slide => [
      ...slide.shapes.map(shape => shape.text),
      ...slide.tables.flatMap(table => table.rows.map(row => row.map(String).join('\t'))),
      ...(slide.notes === '' ? [] : [`Notes: ${slide.notes}`]),
    ].join('\n'))
    .join('\n\n')
}

/**
 * Whether a value bound in scope is a read deck (so `extract … from` can take it).
 *
 * @param value - Anything.
 * @returns Whether it is a {@link DeckDocument}.
 */
export function isDeckDocument (value: unknown): value is DeckDocument {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'deck' && Array.isArray((value as { slides?: unknown }).slides)
}
