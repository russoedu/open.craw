import type { DocumentBlock, DocumentTable, Paragraph, WordDocument } from '@opencraw/office-reader/docx'
import { sectioned } from '../markdown-document'

/**
 * Reads a `.docx` Word document into HTML, through `@opencraw/office-reader`,
 * so every selector that reads a page reads a Word document too:
 *
 * - headings become `<h1>`…`<h6>` inside `<section data-heading="…">`, as in
 *   rendered Markdown;
 * - list items become nested `<ul>` / `<ol>`;
 * - tables become `<table>`s with their merged cells as `colspan` / `rowspan`,
 *   so a `table` extract reads them like any HTML table;
 * - a paragraph keeps its style as `data-style` and its links as `<a href>`;
 * - headers, footers and notes follow the body, in `<header>`, `<footer>`
 *   and `<aside data-part="notes">`; the title goes to `<title>`.
 *
 * The reader is imported on first use.
 *
 * @param bytes - The file.
 * @param source - Where it came from, for messages.
 * @returns The HTML document.
 * @throws Error naming the source, and saying what to do, for a file that is
 * not a readable Word document (a legacy `.doc`, a password-protected file, an `.odt`…).
 */
export async function readDocxHtml (bytes: Uint8Array, source: string): Promise<string> {
  const { readDocx, OfficeReadError } = await import('@opencraw/office-reader/docx')
  let document: WordDocument
  try {
    document = await readDocx(bytes)
  } catch (error) {
    if (error instanceof OfficeReadError) throw new Error(`${source}: ${error.message}`, { cause: error })
    throw error
  }
  const head = document.title === undefined ? '' : `<title>${escapeText(document.title)}</title>`
  const headers = document.headers.map(blocks => `<header data-part="header">${blocksHtml(blocks)}</header>`).join('')
  const footers = document.footers.map(blocks => `<footer data-part="footer">${blocksHtml(blocks)}</footer>`).join('')
  const notes = document.notes.length === 0 ? '' : `<aside data-part="notes"><ol>${document.notes.map(note => `<li id="${note.kind}-${escapeAttribute(note.id)}" data-kind="${note.kind}">${textHtml(note.text)}</li>`).join('')}</ol></aside>`

  return `<!doctype html><html><head>${head}</head><body>${headers}${sectioned(blocksHtml(document.body))}${footers}${notes}</body></html>`
}

/** Blocks as HTML: headings, paragraphs, nested lists, tables. */
function blocksHtml (blocks: readonly DocumentBlock[]): string {
  let html = ''
  const lists: { tag: 'ul' | 'ol', itemOpen: boolean }[] = []
  const closeLists = (depth: number): void => {
    while (lists.length > depth) {
      const list = lists.pop()
      html += `${list?.itemOpen === true ? '</li>' : ''}</${list?.tag ?? 'ul'}>`
    }
  }
  for (const block of blocks) {
    if (block.kind === 'table') {
      closeLists(0)
      html += tableHtml(block)
      continue
    }
    if (block.list === undefined) {
      closeLists(0)
      html += paragraphHtml(block)
      continue
    }
    const tag = block.list.ordered ? 'ol' : 'ul'
    const depth = block.list.level + 1
    closeLists(depth)
    if (lists.length === depth && lists.at(-1)?.tag !== tag) closeLists(depth - 1)
    while (lists.length < depth) {
      html += `<${tag}>`
      lists.push({ tag, itemOpen: false })
    }
    const list = lists[depth - 1]
    html += `${list.itemOpen ? '</li>' : ''}<li${styleAttribute(block)}>${inlineHtml(block)}`
    list.itemOpen = true
  }
  closeLists(0)

  return html
}

function paragraphHtml (paragraph: Paragraph): string {
  if (paragraph.heading !== undefined) {
    const level = Math.min(paragraph.heading, 6)

    return `<h${level}${styleAttribute(paragraph)}>${inlineHtml(paragraph)}</h${level}>`
  }

  return `<p${styleAttribute(paragraph)}>${inlineHtml(paragraph)}</p>`
}

/** A paragraph's text with its links as anchors, in the order they appear. */
function inlineHtml (paragraph: Paragraph): string {
  let html = ''
  let rest = paragraph.text
  const links = paragraph.links ?? []
  for (const link of links) {
    const at = rest.indexOf(link.text)
    if (at === -1) continue
    html += `${textHtml(rest.slice(0, at))}<a href="${escapeAttribute(link.href)}">${textHtml(link.text)}</a>`
    rest = rest.slice(at + link.text.length)
  }

  return html + textHtml(rest)
}

/** A grid as a table: the top-left cell of a merged range spans it, the cells it covers are left out. */
function tableHtml (table: DocumentTable): string {
  const spans = new Map<string, { rows: number, columns: number }>()
  const covered = new Set<string>()
  for (const range of table.merges) {
    const [from, to] = range.split(':').map(reference => cellOf(reference))
    if (from === undefined || to === undefined) continue
    spans.set(`${from.row},${from.column}`, { rows: to.row - from.row + 1, columns: to.column - from.column + 1 })
    for (let row = from.row; row <= to.row; row += 1) {
      for (let column = from.column; column <= to.column; column += 1) {
        if (row !== from.row || column !== from.column) covered.add(`${row},${column}`)
      }
    }
  }
  const rows = table.rows.map((cells, row) => {
    const html = cells.map((text, column) => {
      const key = `${row},${column}`
      if (covered.has(key)) return ''
      const span = spans.get(key)
      const attributes = span === undefined ? '' : `${span.rows > 1 ? ` rowspan="${span.rows}"` : ''}${span.columns > 1 ? ` colspan="${span.columns}"` : ''}`

      return `<td${attributes}>${textHtml(text)}</td>`
    }).join('')

    return `<tr>${html}</tr>`
  }).join('')

  return `<table data-name="${escapeAttribute(table.name)}">${rows}</table>`
}

/** An A1 reference as 0-based row and column. */
function cellOf (reference: string): { row: number, column: number } | undefined {
  const match = /^([A-Z]+)(\d+)$/.exec(reference)
  if (match === null) return undefined
  let column = 0
  const letters = match[1]
  for (const letter of letters) column = column * 26 + (letter.codePointAt(0) ?? 64) - 64

  return { row: Number(match[2]) - 1, column: column - 1 }
}

function styleAttribute (paragraph: Paragraph): string {
  return paragraph.style === undefined ? '' : ` data-style="${escapeAttribute(paragraph.style)}"`
}

/** Text as HTML: escaped, line breaks as `<br>`. */
function textHtml (text: string): string {
  return escapeText(text).replaceAll('\n', '<br>')
}

function escapeText (text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute (text: string): string {
  return escapeText(text).replaceAll('"', '&quot;')
}
