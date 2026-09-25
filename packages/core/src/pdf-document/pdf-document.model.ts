/** A run of text at a position on a page, in PDF points, y growing upwards from the bottom edge. */
export interface PositionedText {
  x:      number
  /** The baseline. */
  y:      number
  width:  number
  /** The font size: the text spans roughly `y` to `y + height`. */
  height: number
  text:   string
}

/** One or more text runs that sit side by side on one baseline: a table cell, a label, a value. */
export type PdfCell = PositionedText

/** Cells whose vertical extents overlap: one visual line, which in a table is one row. */
export interface PdfRow {
  /** The top of the highest cell. */
  top:    number
  /** The baseline of the lowest cell. */
  bottom: number
  /** The cells, left to right. */
  cells:  PdfCell[]
  /** The cells' texts joined by a tab, left to right. */
  text:   string
}

export interface PdfPage {
  number: number
  width:  number
  height: number
  /** Top to bottom. Empty on a page with no text layer (a scan). */
  rows:   PdfRow[]
}

/** A PDF read into rows of positioned text: what `extract` works on. */
export interface PdfDocument {
  kind:  'pdf'
  pages: PdfPage[]
}

/**
 * The text a `regex` extract reads: one line per row (cells separated by a
 * tab), pages separated by a blank line.
 *
 * @param document - The PDF.
 * @returns The text.
 */
export function pdfText (document: PdfDocument): string {
  return document.pages.map(page => page.rows.map(row => row.text).join('\n')).join('\n\n')
}

/**
 * Whether a value bound in scope is a read PDF (so `extract … from` can take it).
 *
 * @param value - Anything.
 * @returns Whether it is a {@link PdfDocument}.
 */
export function isPdfDocument (value: unknown): value is PdfDocument {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'pdf' && Array.isArray((value as { pages?: unknown }).pages)
}
