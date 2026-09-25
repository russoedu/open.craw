import type { PdfDocument, PdfPage, PositionedText } from './pdf-document.model'
import { assembleRows } from './row-assembly.algorithm'

/** A PDF that cannot be read: not a PDF, encrypted, or with no text to read. */
export class PdfReadError extends Error {
  override readonly name = 'PdfReadError'
}

/**
 * Reads a PDF's text layer into rows of positioned cells, with pdf.js. pdf.js
 * is imported on first use, so recipes that never read a PDF never load it.
 * Only text is read: no page is rendered, no script runs, no font is loaded.
 *
 * @param bytes - The file.
 * @param source - Where it came from, for messages.
 * @returns The document.
 * @throws PdfReadError when the bytes are not a readable PDF, or no page has a
 * text layer (a scan: OCR is not supported).
 */
export async function readPdf (bytes: Uint8Array, source = 'PDF'): Promise<PdfDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdf.js takes ownership of the buffer it is given, and refuses a Node
  // Buffer: hand it a plain copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, disableFontFace: true, useSystemFonts: false, stopAtErrors: true })
  let loaded: Awaited<typeof task.promise>
  try {
    loaded = await task.promise
  } catch (error) {
    throw new PdfReadError(`${source}: not a readable PDF (${(error as Error).message})`, { cause: error })
  }
  try {
    const pages: PdfPage[] = []
    for (let number = 1; number <= loaded.numPages; number += 1) {
      const page = await loaded.getPage(number)
      const { width, height } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const runs = content.items.flatMap(item => ('str' in item ? [runOf(item)] : []))
      pages.push({ number, width, height, rows: assembleRows(runs) })
    }
    if (pages.every(page => page.rows.length === 0)) throw new PdfReadError(`${source}: no page has a text layer (a scanned PDF? OCR is not supported)`)

    return { kind: 'pdf', pages }
  } finally {
    await task.destroy()
  }
}

function runOf (item: { str: string, transform: number[], width: number, height: number }): PositionedText {
  const [a, b, c, d, x, y] = item.transform

  return { x, y, width: item.width, height: item.height > 0 ? item.height : Math.hypot(c, d) || Math.hypot(a, b), text: item.str }
}
