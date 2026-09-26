import { hyperlinksOf, OoxmlPackage, relationshipOfType, relationshipsOf, walkXml } from '../ooxml-package'
import type { PackageLimits } from '../ooxml-package'
import { OfficeReadError } from '../read-error'
import { readSource } from '../source-bytes'
import type { OfficeSource } from '../source-bytes'
import { readBlocks } from './body.mapper'
import type { BodyContext } from './body.mapper'
import { readNumbering } from './numbering.mapper'
import { readStyles } from './styles.mapper'
import type { DocumentBlock, DocumentNote, WordDocument } from './word-document.model'

/** How to read a Word document. */
export interface ReadDocxOptions {
  /** Read headers, footers and notes; default true. */
  extras?: boolean
  /** How much the file may inflate to. */
  limits?: PackageLimits
}

/**
 * Reads a `.docx` Word document (also `.docm`, `.dotx`): its body as
 * paragraphs (with heading and list levels, and links) and tables (with
 * merged cells), its headers and footers, its footnotes and endnotes, and its
 * title.
 *
 * @param source - A path, bytes, a Blob or a stream (see {@link OfficeSource}).
 * @param options - Whether to read headers, footers and notes; the limits.
 * @returns The document.
 * @throws OfficeReadError for a file that is not a readable Word document: `legacy-format` (`.doc`), `encrypted`, `unsupported-format` (`.odt`), `not-docx`, `too-large`…
 */
export async function readDocx (source: OfficeSource, options: ReadDocxOptions = {}): Promise<WordDocument> {
  const pkg = OoxmlPackage.open(await readSource(source), options.limits)
  const packageRelationships = relationshipsOf(pkg, '')
  const main = relationshipOfType(packageRelationships, 'officeDocument')?.target ?? (pkg.has('word/document.xml') ? 'word/document.xml' : '')
  const xml = main === '' ? '' : pkg.text(main)
  if (!/<(?:\w+:)?document[\s>]/.test(xml.slice(0, 4096)) || !/<(?:\w+:)?body[\s>]/.test(xml)) {
    const other = main.endsWith('workbook.xml') ? ' (a spreadsheet: read it with readXlsx)' : (main.endsWith('presentation.xml') ? ' (a presentation: read it with readPptx)' : '')
    throw new OfficeReadError('not-docx', `not a Word document: the package's main part is ${main === '' ? 'missing' : main}${other}`)
  }
  const relationships = relationshipsOf(pkg, main)
  const part = (type: string): string => {
    const target = relationshipOfType(relationships, type)?.target

    return target === undefined ? '' : pkg.text(target)
  }
  const styles = readStyles(part('styles'))
  const ordered = readNumbering(part('numbering'))
  const context = (partName: string): BodyContext => ({ styles, ordered, links: hyperlinksOf(pkg, partName) })
  const { blocks: body } = readBlocks(xml, context(main))
  const headers: DocumentBlock[][] = []
  const footers: DocumentBlock[][] = []
  const notes: DocumentNote[] = []
  if (options.extras !== false) {
    for (const relationship of relationships.values()) {
      if (relationship.type === 'header' || relationship.type === 'footer') {
        const { blocks } = readBlocks(pkg.text(relationship.target), context(relationship.target))
        if (blocks.length > 0) (relationship.type === 'header' ? headers : footers).push(blocks)
      } else if (relationship.type === 'footnotes' || relationship.type === 'endnotes') {
        notes.push(...readBlocks(pkg.text(relationship.target), context(relationship.target)).notes)
      }
    }
  }
  const title = titleOf(pkg.text(relationshipOfType(packageRelationships, 'core-properties')?.target ?? 'docProps/core.xml'))

  return { ...(title !== undefined && { title }), body, headers, footers, notes }
}

/** The `dc:title` of the core properties part, when set. */
function titleOf (xml: string): string | undefined {
  let inTitle = false
  let title = ''
  walkXml(xml, {
    open:  (name) => { inTitle = name === 'title' },
    text:  (text) => { if (inTitle) title += text },
    close: () => { inTitle = false },
  })
  title = title.trim()

  return title === '' ? undefined : title
}
