import { namespacedAttribute, walkXml } from '../ooxml-package'
import type { DocumentBlock, DocumentLink, DocumentNote, DocumentTable, Paragraph } from './word-document.model'
import type { ParagraphStyles } from './styles.mapper'

/** What reading a part needs from the rest of the document. */
export interface BodyContext {
  styles:  ParagraphStyles
  ordered: (numId: string, level: number) => boolean
  /** The part's relationships: a hyperlink's `r:id` to its URL. */
  links:   ReadonlyMap<string, string>
}

interface OpenParagraph {
  text:     string
  style?:   string
  outline?: number
  numId?:   string
  level?:   number
  links:    DocumentLink[]
  link?:    { href: string, from: number }
  /** Blocks of the text boxes it holds: they follow it. */
  boxed:    DocumentBlock[]
}

interface OpenCell {
  paragraphs: string[]
  span:       number
  vMerge?:    'restart' | 'continue'
}

interface OpenTable {
  rows:     string[][]
  merges:   string[]
  row?:     string[]
  cell?:    OpenCell
  /** Vertical merges still open, by grid column: where each started and how wide it is. */
  vertical: Map<number, { row: number, end: number, span: number }>
}

/** Elements whose content is not part of the document's text: deleted runs, field codes, the fallback copy of alternate content. */
const SKIPPED = new Set(['del', 'moveFrom', 'instrText', 'delInstrText', 'Fallback'])

/**
 * Reads the blocks of a WordprocessingML part (the body, a header, a note):
 * paragraphs with their style, heading level, list level and links, and
 * tables as grids with merged cells (`gridSpan` across, `vMerge` down) as
 * ranges. Tracked insertions read as text, deletions do not. A paragraph in a
 * text box comes after the paragraph that holds the box; a table inside a
 * cell is a block of its own, and its text also joins the cell's.
 *
 * Footnotes and endnotes (`footnotes.xml`, `endnotes.xml`) come back as
 * notes, one per note, their paragraphs joined.
 *
 * @param xml - The part.
 * @param context - Styles, numbering, links.
 * @returns The blocks, in document order, and the notes.
 */
export function readBlocks (xml: string, context: BodyContext): { blocks: DocumentBlock[], notes: DocumentNote[] } {
  const blocks: DocumentBlock[] = []
  const notes: DocumentNote[] = []
  let note: { kind: DocumentNote['kind'], id: string, start: number } | undefined
  let inProperties = false
  const paragraphs: OpenParagraph[] = []
  const tables: OpenTable[] = []
  // Where a paragraph that closes goes: a table cell, or the list of blocks (the body, a text box).
  const containers: ('cell' | 'blocks')[] = ['blocks']
  let skipping = 0
  let inText = false
  let inNumbering = false
  let tableCount = 0
  const append = (text: string): void => {
    const paragraph = paragraphs.at(-1)
    if (paragraph !== undefined && skipping === 0) paragraph.text += text
  }
  walkXml(xml, {
    open: (name, attributes) => {
      if (SKIPPED.has(name)) {
        skipping += 1

        return
      }
      if (skipping > 0) return
      const paragraph = paragraphs.at(-1)
      const table = tables.at(-1)
      const value = namespacedAttribute(attributes, 'val')
      switch (name) {
        case 'p': {
          paragraphs.push({ text: '', links: [], boxed: [] })

          break
        }
        case 'pPr': {
          inProperties = true

          break
        }
        case 'footnote':
        case 'endnote': {
          note = { kind: name, id: namespacedAttribute(attributes, 'id') ?? '', start: blocks.length }

          break
        }
        case 'pStyle': {
          if (paragraph !== undefined) paragraph.style = value

          break
        }
        case 'outlineLvl': {
          if (paragraph !== undefined) paragraph.outline = Number(value)

          break
        }
        case 'numPr': {
          inNumbering = true

          break
        }
        case 'numId': {
          if (inNumbering && paragraph !== undefined) paragraph.numId = value

          break
        }
        case 'ilvl': {
          if (inNumbering && paragraph !== undefined) paragraph.level = Number(value)

          break
        }
        case 't': {
          inText = true

          break
        }
        case 'tab':
        case 'ptab': {
          // A tab stop in the paragraph's properties is not a tab in its text.
          if (!inProperties) append('\t')

          break
        }
        case 'br':
        case 'cr': {
          append('\n')

          break
        }
        case 'noBreakHyphen': {
          append('-')

          break
        }
        case 'hyperlink': {
          const id = namespacedAttribute(attributes, 'id')
          const anchor = namespacedAttribute(attributes, 'anchor')
          const href = id === undefined ? (anchor === undefined ? undefined : `#${anchor}`) : context.links.get(id)
          if (paragraph !== undefined && href !== undefined) paragraph.link = { href, from: paragraph.text.length }

          break
        }
        case 'txbxContent': {
          containers.push('blocks')

          break
        }
        case 'tbl': {
          tables.push({ rows: [], merges: [], vertical: new Map() })

          break
        }
        case 'tr': {
          if (table !== undefined) table.row = []

          break
        }
        case 'gridBefore': {
          if (table?.row !== undefined) table.row.push(...Array.from({ length: Number(value ?? 0) }, () => ''))

          break
        }
        case 'tc': {
          if (table !== undefined) table.cell = { paragraphs: [], span: 1 }
          containers.push('cell')

          break
        }
        case 'gridSpan': {
          if (table?.cell !== undefined) table.cell.span = Math.max(1, Number(value ?? 1))

          break
        }
        case 'vMerge': {
          if (table?.cell !== undefined) table.cell.vMerge = value === 'restart' ? 'restart' : 'continue'

          break
        }
        // No default
      }
    },
    text: (text) => {
      if (inText) append(text)
    },
    close: (name) => {
      if (SKIPPED.has(name)) {
        skipping -= 1

        return
      }
      if (skipping > 0) return
      switch (name) {
        case 't': {
          inText = false

          break
        }
        case 'numPr': {
          inNumbering = false

          break
        }
        case 'pPr': {
          inProperties = false

          break
        }
        case 'footnote':
        case 'endnote': {
          if (note === undefined) break
          const text = blocks.splice(note.start).map(block => (block.kind === 'paragraph' ? block.text : block.rows.map(row => row.join(' ')).join('\n'))).join('\n')
          if (text !== '') notes.push({ kind: note.kind, id: note.id, text })
          note = undefined

          break
        }
        case 'hyperlink': {
          const paragraph = paragraphs.at(-1)
          if (paragraph?.link !== undefined) {
            const text = paragraph.text.slice(paragraph.link.from).trim()
            if (text !== '') paragraph.links.push({ text, href: paragraph.link.href })
            paragraph.link = undefined
          }

          break
        }
        case 'p': {
          const open = paragraphs.pop()
          if (open === undefined) break
          const block = paragraphBlock(open, context)
          const emitted = [...(block === undefined ? [] : [block]), ...open.boxed]
          const host = paragraphs.at(-1)
          if (containers.at(-1) === 'cell') tables.at(-1)?.cell?.paragraphs.push(open.text, ...open.boxed.map(boxed => (boxed.kind === 'paragraph' ? boxed.text : '')))
          // A paragraph in a text box waits for the paragraph holding the box.
          else if (host === undefined) blocks.push(...emitted)
          else host.boxed.push(...emitted)

          break
        }
        case 'txbxContent': {
          containers.pop()

          break
        }
        case 'tc': {
          containers.pop()
          const table = tables.at(-1)
          if (table?.cell !== undefined && table.row !== undefined) closeCell(table, table.cell, table.row)
          if (table !== undefined) table.cell = undefined

          break
        }
        case 'tr': {
          const table = tables.at(-1)
          if (table?.row !== undefined) table.rows.push(table.row)
          if (table !== undefined) table.row = undefined

          break
        }
        case 'tbl': {
          const table = tables.pop()
          if (table === undefined) break
          for (const [column, open] of table.vertical) closeVertical(table, column, open)
          tableCount += 1
          const block: DocumentTable = { kind: 'table', name: `table ${tableCount}`, hidden: false, rows: table.rows, hiddenRows: [], merges: table.merges }
          blocks.push(block)
          // A table inside a cell: its text belongs to the cell too.
          tables.at(-1)?.cell?.paragraphs.push(table.rows.map(row => row.filter(cell => cell !== '').join(' ')).join('\n'))

          break
        }
        // No default
      }
    },
  })

  return { blocks, notes }
}

function paragraphBlock (open: OpenParagraph, context: BodyContext): Paragraph | undefined {
  const text = open.text.replaceAll(/[ \t]+\n/g, '\n').trim()
  if (text === '') return undefined
  const heading = open.outline !== undefined && open.outline < 9 ? open.outline + 1 : context.styles.heading(open.style)
  const numbering = open.numId === undefined ? context.styles.list(open.style) : { numId: open.numId, level: open.level ?? 0 }
  const list = heading !== undefined || numbering === undefined || numbering.numId === '0' ? undefined : { level: numbering.level, ordered: context.ordered(numbering.numId, numbering.level) }

  return {
    kind: 'paragraph',
    text,
    ...(open.style !== undefined && { style: open.style }),
    ...(heading !== undefined && { heading }),
    ...(list !== undefined && { list }),
    ...(open.links.length > 0 && { links: open.links }),
  }
}

/** Places a closed cell in its row: its text, then a blank for each extra grid column it spans; tracks merges. */
function closeCell (table: OpenTable, cell: OpenCell, row: string[]): void {
  const column = row.length
  const rowIndex = table.rows.length
  const open = table.vertical.get(column)
  if (open !== undefined && cell.vMerge === 'continue') {
    open.end = rowIndex
    row.push(...Array.from({ length: cell.span }, () => ''))

    return
  }
  if (open !== undefined) closeVertical(table, column, open)
  row.push(cell.paragraphs.join('\n').trim(), ...Array.from({ length: cell.span - 1 }, () => ''))
  if (cell.vMerge === 'restart') table.vertical.set(column, { row: rowIndex, end: rowIndex, span: cell.span })
  else if (cell.span > 1) table.merges.push(rangeOf(rowIndex, column, 1, cell.span))
}

function closeVertical (table: OpenTable, column: number, open: { row: number, end: number, span: number }): void {
  table.vertical.delete(column)
  if (open.end > open.row || open.span > 1) table.merges.push(rangeOf(open.row, column, open.end - open.row + 1, open.span))
}

/** A merged range as an A1 reference (`A1:D1`). */
function rangeOf (row: number, column: number, rowSpan: number, columnSpan: number): string {
  return `${columnLetter(column)}${row + 1}:${columnLetter(column + columnSpan - 1)}${row + rowSpan}`
}

function columnLetter (index: number): string {
  let letters = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCodePoint(65 + ((rest - 1) % 26)) + letters

  return letters
}
