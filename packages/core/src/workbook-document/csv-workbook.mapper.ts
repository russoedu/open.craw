import { detectDelimiter, parseCsv } from './csv-parser.algorithm'
import type { WorkbookDocument } from './workbook-document.model'

/**
 * Reads decoded CSV text into a workbook of one sheet, named after the file.
 *
 * @param text - The decoded file.
 * @param options - The sheet name, the encoding it was decoded from (for a
 * probe to report) and a delimiter; without one it is detected.
 * @returns The workbook.
 * @throws Error when the delimiter given is not one character.
 */
export function csvWorkbook (text: string, options: { name: string, encoding: string, delimiter?: string }): WorkbookDocument {
  if (options.delimiter !== undefined && [...options.delimiter].length !== 1) throw new Error(`a CSV delimiter is one character; got "${options.delimiter}"`)
  const delimiter = options.delimiter ?? detectDelimiter(text)

  return { kind: 'workbook', sheets: [{ name: options.name, rows: parseCsv(text, delimiter) }], csv: { encoding: options.encoding, delimiter } }
}

/**
 * The name a CSV's sheet takes: the file name without its extension
 * (`…/prezzo_alle_8.csv` → `prezzo_alle_8`), else `csv`.
 *
 * @param url - Where the file came from.
 * @returns The name.
 */
export function sheetNameOf (url: string): string {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    path = url
  }
  const file = path.split('/').at(-1) ?? ''
  let name: string
  try {
    name = decodeURIComponent(file)
  } catch {
    name = file
  }
  name = name.replace(/\.[^.]*$/, '')

  return name === '' ? 'csv' : name
}
