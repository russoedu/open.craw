import { isOn, namespacedAttribute, OoxmlPackage, relationshipOfType, relationshipsOf, walkXml } from '../ooxml-package'
import type { PackageLimits } from '../ooxml-package'
import { OfficeReadError } from '../read-error'
import { readSource } from '../source-bytes'
import type { OfficeSource } from '../source-bytes'
import { formatKinds } from './number-formats.mapper'
import { sharedStrings } from './shared-strings.mapper'
import type { CellValue, Sheet, SheetFilter, ValueMode, Workbook } from './workbook.model'
import { readWorksheet } from './worksheet.mapper'

/** How to read a workbook. */
export interface ReadXlsxOptions {
  /** Which sheets to read; default all. Unselected sheets are never inflated. */
  sheets?: SheetFilter
  /** `typed` (default): numbers, booleans, dates as values; `text`: every cell as canonical text. */
  values?: ValueMode
  /** How much the file may inflate to. */
  limits?: PackageLimits
}

interface SheetEntry {
  name:   string
  hidden: boolean
  id:     string | undefined
}

/**
 * Reads an `.xlsx` (or `.xlsm`) workbook: every worksheet's cells, with the
 * merged ranges and hidden rows a person would see. Formulas give their
 * cached value; nothing is evaluated. Display formats are not applied.
 *
 * @param source - A path, bytes, a Blob or a stream (see {@link OfficeSource}).
 * @param options - Which sheets, which value mode, which limits.
 * @returns The workbook.
 * @throws OfficeReadError for a file that is not a readable workbook: `legacy-format` (`.xls`), `encrypted`, `unsupported-format` (`.ods`), `not-xlsx`, `too-large`…
 */
export async function readXlsx (source: OfficeSource, options: ReadXlsxOptions & { values: 'text' }): Promise<Workbook<string>>
export async function readXlsx (source: OfficeSource, options?: ReadXlsxOptions): Promise<Workbook>
export async function readXlsx (source: OfficeSource, options: ReadXlsxOptions = {}): Promise<Workbook<CellValue>> {
  const pkg = OoxmlPackage.open(await readSource(source), options.limits)
  const workbookPart = mainPart(pkg)
  let date1904 = false
  const entries: SheetEntry[] = []
  let isWorkbook = false
  walkXml(pkg.text(workbookPart), {
    open: (name, attributes) => {
      switch (name) {
        case 'workbook': {
          isWorkbook = true
          break
        }
        case 'workbookPr': {
          date1904 = isOn(attributes.date1904)
          break
        }
        case 'sheet': { {
          entries.push({ name: attributes.name ?? '', hidden: attributes.state === 'hidden' || attributes.state === 'veryHidden', id: namespacedAttribute(attributes, 'id') })
          // No default
        }
        break
        }
      }
    },
  })
  if (!isWorkbook) throw new OfficeReadError('not-xlsx', `not a spreadsheet: the package's main part is ${workbookPart === '' ? 'missing' : workbookPart}${workbookPart.endsWith('presentation.xml') ? ' (a presentation: read it with readPptx)' : ''}`)
  const relationships = relationshipsOf(pkg, workbookPart)
  const stringsPart = relationshipOfType(relationships, 'sharedStrings')?.target
  const stylesPart = relationshipOfType(relationships, 'styles')?.target
  const context = {
    sharedStrings: stringsPart === undefined ? [] : sharedStrings(pkg.text(stringsPart)),
    formats:       stylesPart === undefined ? [] : formatKinds(pkg.text(stylesPart)),
    date1904,
  }
  const selected = selector(options.sheets)
  const sheets: Sheet[] = []
  for (const entry of entries) {
    const part = entry.id === undefined ? undefined : relationships.get(entry.id)
    // Chart sheets, dialog sheets and macro sheets hold no cells.
    if (part?.type !== 'worksheet' || !selected(entry)) continue
    const content = readWorksheet(pkg.text(part.target), context, options.values ?? 'typed')
    sheets.push({ name: entry.name, hidden: entry.hidden, ...content })
  }

  return { date1904, sheets }
}

/** The package's main part, from its root relationships (`xl/workbook.xml` by convention, not by rule). */
function mainPart (pkg: OoxmlPackage): string {
  const main = relationshipOfType(relationshipsOf(pkg, ''), 'officeDocument')?.target
  if (main !== undefined) return main

  return pkg.has('xl/workbook.xml') ? 'xl/workbook.xml' : ''
}

function selector (filter: SheetFilter | undefined): (sheet: { name: string, hidden: boolean }) => boolean {
  if (filter === undefined) return () => true
  if (typeof filter === 'string') return sheet => sheet.name === filter
  if (filter instanceof RegExp) return sheet => filter.test(sheet.name)

  return filter
}
