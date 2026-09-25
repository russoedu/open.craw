// Writes the CSV fixtures the workbook-document tests read. They reproduce
// what real European exports do: Windows-1252 bytes (no charset declared),
// `;` between fields and `,` in decimals, a title and a blank line above the
// header, a quoted field holding the delimiter and a line break, a stray
// quote inside an unquoted field, a model written once over its versions,
// and a totals row. The TSV is Excel's "Unicode text" export: UTF-16 LE with
// a byte-order mark, tab-separated.
//
//   node packages/core/tools/make-csv-fixtures.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'workbook-document', 'fixtures')

const listino = [
  'Listino prezzi autoveicoli – settembre 2026',
  '',
  'Marca;Modello;Versione;Prezzo €;Sconto %',
  'Fiat;Pandina;1.0 Hybrid "Cross";15.950,00;12,5',
  ';;1.0 Hybrid Icon;16.450,00;12,5',
  // Excel writes a line break inside a cell as a bare LF, records end in CRLF.
  'Citroën;C3;"Plus; automatica\nnuova";19.300,00;8',
  'Peugeot;208;Allure;21.450,00;',
  '',
  'Totale;;;73.150,00;',
].join('\r\n') + '\r\n'

writeFileSync(join(out, 'listino.csv'), encode1252(listino))

const tsv = [
  'Marke\tModell\tPreis',
  'Škoda\tElroq\t33.900',
  'Volkswagen\tID.3\t36.900',
].join('\r\n') + '\r\n'
writeFileSync(join(out, 'listino.tsv'), Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(tsv, 'utf16le')]))

/** Windows-1252: Latin-1 plus the printable 0x80–0x9F block (€, –, …). */
function encode1252 (text) {
  const extra = new Map([['€', 0x80], ['–', 0x96], ['—', 0x97], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94]])

  return Buffer.from([...text].map((char) => {
    if (extra.has(char)) return extra.get(char)
    const code = char.codePointAt(0)
    if (code > 0xFF) throw new Error(`${char} is not in Windows-1252`)

    return code
  }))
}
