import type { DeckDocument } from './deck-document.model'

/**
 * Reads a `.pptx` presentation into a deck document, through
 * `@opencraw/office-reader`: every slide's text boxes with their positions,
 * its tables with their merged cells, its charts' cached data and its notes.
 * The reader is imported on first use, so recipes that never read a
 * presentation never load it.
 *
 * @param bytes - The file.
 * @param source - Where it came from, for messages.
 * @returns The deck.
 * @throws Error naming the source, and saying what to do, for a file that is
 * not a readable presentation (a legacy `.ppt`, a password-protected file, an `.odp`…).
 */
export async function readPptxDeck (bytes: Uint8Array, source: string): Promise<DeckDocument> {
  const { readPptx, OfficeReadError } = await import('@opencraw/office-reader/pptx')
  try {
    const deck = await readPptx(bytes)

    return {
      kind:   'deck',
      width:  deck.width,
      height: deck.height,
      slides: deck.slides.map(slide => ({
        ...slide,
        tables: slide.tables.map(table => ({ name: table.name, rows: table.rows, merges: table.merges })),
      })),
    }
  } catch (error) {
    if (error instanceof OfficeReadError) throw new Error(`${source}: ${error.message}`, { cause: error })
    throw error
  }
}
