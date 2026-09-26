import type { Sheet } from '../spreadsheet'

/** A run of text that links somewhere: a URL, or a bookmark in the document (`#name`). */
export interface DocumentLink {
  text: string
  href: string
}

/** A paragraph, with what Word says it is: a heading, a list item, or plain text. */
export interface Paragraph {
  kind:     'paragraph'
  text:     string
  /** The paragraph style's id (`Heading1`, `ListBullet`, a custom `Prezzo`). */
  style?:   string
  /** 1 to 9 for a heading (a `Heading N` style, a style with an outline level, or `Title` as 1). */
  heading?: number
  /** For a list item: its level from 0, and whether it is numbered. */
  list?:    { level: number, ordered: boolean }
  links?:   DocumentLink[]
}

/** A table as a grid: rows of cell texts, merged cells as A1 ranges whose value sits in the top-left cell. */
export type DocumentTable = { kind: 'table' } & Sheet<string>

export type DocumentBlock = Paragraph | DocumentTable

/** A footnote or an endnote. */
export interface DocumentNote {
  kind: 'footnote' | 'endnote'
  id:   string
  text: string
}

/** What a Word document holds. */
export interface WordDocument {
  /** The title in the document's properties, when it has one. */
  title?:  string
  /** The body, in order: paragraphs and tables. Text boxes come after the paragraph they sit in. */
  body:    DocumentBlock[]
  /** Each header part's blocks (first page, odd, even pages…). */
  headers: DocumentBlock[][]
  footers: DocumentBlock[][]
  notes:   DocumentNote[]
}
