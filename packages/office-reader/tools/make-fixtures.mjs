// Writes the fixtures the office-reader tests read, by hand: SpreadsheetML is
// a zip of small XML parts, and writing them directly keeps third-party files
// out of the repository and documents the minimum a reader needs.
//
// incentivi.xlsx reproduces what real price and incentive workbooks do: a
// title merged over the table, a two-row header whose group cell is merged
// across its sub-columns and whose other cells are merged down, a model merged
// down its versions, a formula with its cached value, a percentage, a date, a
// date-time and a time of day, booleans, rich text, an error, an inline
// string, a hidden row, a hidden sheet, a chart sheet, cells without their
// reference, a phonetic guide, and a second table on another sheet.
//
//   node packages/office-reader/tools/make-fixtures.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const spreadsheet = join(root, 'spreadsheet', 'fixtures')
const pkg = join(root, 'ooxml-package', 'fixtures')

const NS = 'https://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'https://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'https://schemas.openxmlformats.org/package/2006/relationships'
const xml = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`
const rels = entries => xml(`<Relationships xmlns="${PKG_REL}">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`)
const rootRels = main => rels([['rId1', 'officeDocument', main]])

function zip (parts) {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, typeof text === 'string' ? strToU8(text) : text])))
}

// Shared strings: plain, rich text in runs, and a phonetic guide that is not part of the text.
const strings = [
  'Incentivi concessionari – giugno 2026', 'Marca', 'Modello', 'Prezzo', 'Listino', 'Netto', 'Sconto', 'Valido dal', 'Attivo', 'Nota',
  'Fiat', 'Pandina', 'Pandina Cross', 'Jeep', 'Consegna', 'secret', 'Mese', 'Totale',
]
const sharedStrings = xml(`<sst xmlns="${NS}" count="${strings.length + 2}" uniqueCount="${strings.length + 2}">${strings.map(text => `<si><t>${text.replaceAll('&', '&amp;')}</t></si>`).join('')}` +
  '<si><r><t xml:space="preserve">Solo </t></r><r><rPr><b/></rPr><t>rottamazione</t></r></si>' +
  '<si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh></si></sst>')
const s = text => strings.indexOf(text)
const RICH = strings.length
const PHONETIC = strings.length + 1

// Styles: 0 general, 1 currency, 2 percent (built-in 10), 3 date, 4 date-time, 5 time (built-in 20), 6 elapsed hours.
const styles = xml(`<styleSheet xmlns="${NS}"><numFmts count="4">` +
  String.raw`<numFmt numFmtId="164" formatCode="#,##0.00\ &quot;€&quot;"/>` +
  '<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>' +
  String.raw`<numFmt numFmtId="166" formatCode="[$-410]dd/mm/yyyy\ hh:mm"/>` +
  '<numFmt numFmtId="167" formatCode="[h]:mm"/></numFmts>' +
  '<cellXfs count="7"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="10" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/><xf numFmtId="20" applyNumberFormat="1"/><xf numFmtId="167" applyNumberFormat="1"/></cellXfs></styleSheet>')

const str = (ref, text) => `<c r="${ref}" t="s"><v>${s(text)}</v></c>`
const num = (ref, value, style = 0) => `<c r="${ref}"${style === 0 ? '' : ` s="${style}"`}><v>${value}</v></c>`
const sheet1 = xml(`<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetData>` +
  `<row r="1">${str('A1', 'Incentivi concessionari – giugno 2026')}</row>` +
  `<row r="3">${str('A3', 'Marca')}${str('B3', 'Modello')}${str('C3', 'Prezzo')}${str('E3', 'Sconto')}${str('F3', 'Valido dal')}${str('G3', 'Attivo')}${str('H3', 'Nota')}</row>` +
  `<row r="4">${str('C4', 'Listino')}${str('D4', 'Netto')}</row>` +
  `<row r="5">${str('A5', 'Fiat')}${str('B5', 'Pandina')}${num('C5', 15_950, 1)}<c r="D5" s="1"><f>C5*(1-E5)</f><v>13955.625</v></c>${num('E5', 0.125, 2)}${num('F5', 46_174, 3)}<c r="G5" t="b"><v>1</v></c><c r="H5" t="s"><v>${RICH}</v></c></row>` +
  `<row r="6">${str('B6', 'Pandina Cross')}${num('C6', 17_950, 1)}<c r="D6" s="1"><f>C6*(1-E6)</f><v>15706.25</v></c>${num('E6', 0.125, 2)}${num('F6', '46174.395833333336', 4)}<c r="G6" t="b"><v>0</v></c><c r="H6" t="e"><f>1/0</f><v>#DIV/0!</v></c></row>` +
  `<row r="7" hidden="1">${str('A7', 'secret')}${num('C7', 1)}</row>` +
  // Cells without their reference follow the one before; an inline string, a long float.
  `<row r="8"><c t="s"><v>${s('Jeep')}</v></c><c t="inlineStr"><is><t>Avenger</t></is></c><c s="1"><v>24950.5</v></c></row>` +
  `<row r="9">${str('A9', 'Consegna')}${num('C9', 0.5, 5)}${num('D9', 1.5, 6)}${num('H9', '78.599999999999994')}<c r="I9" t="s"><v>${PHONETIC}</v></c></row>` +
  '</sheetData><mergeCells count="7"><mergeCell ref="A1:H1"/><mergeCell ref="A3:A4"/><mergeCell ref="B3:B4"/><mergeCell ref="C3:D3"/><mergeCell ref="E3:E4"/><mergeCell ref="F3:F4"/><mergeCell ref="A5:A6"/></mergeCells></worksheet>')
const sheet2 = xml(`<worksheet xmlns="${NS}"><sheetData><row r="1">${str('A1', 'secret')}</row></sheetData></worksheet>`)
const sheet3 = xml(`<worksheet xmlns="${NS}"><sheetData><row r="1">${str('A1', 'Mese')}${str('B1', 'Totale')}</row><row r="2">${num('A2', 46_143, 3)}${num('B2', 42)}</row></sheetData></worksheet>`)
const workbook = xml(`<workbook xmlns="${NS}" xmlns:r="${REL}"><workbookPr/><sheets>` +
  '<sheet name="Incentivi giugno" sheetId="1" r:id="rId1"/><sheet name="Archivio" sheetId="2" state="hidden" r:id="rId2"/>' +
  '<sheet name="Grafico" sheetId="3" r:id="rId3"/><sheet name="Maggio" sheetId="4" r:id="rId4"/></sheets></workbook>')

writeFileSync(join(spreadsheet, 'incentivi.xlsx'), zip({
  '[Content_Types].xml':        xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  '_rels/.rels':                rootRels('xl/workbook.xml'),
  'xl/workbook.xml':            workbook,
  'xl/_rels/workbook.xml.rels': rels([['rId1', 'worksheet', 'worksheets/sheet1.xml'], ['rId2', 'worksheet', 'worksheets/sheet2.xml'], ['rId3', 'chartsheet', 'chartsheets/sheet1.xml'], ['rId4', 'worksheet', '/xl/worksheets/sheet3.xml'], ['rId5', 'sharedStrings', 'sharedStrings.xml'], ['rId6', 'styles', 'styles.xml']]),
  'xl/sharedStrings.xml':       sharedStrings,
  'xl/styles.xml':              styles,
  'xl/worksheets/sheet1.xml':   sheet1,
  'xl/worksheets/sheet2.xml':   sheet2,
  'xl/worksheets/sheet3.xml':   sheet3,
  'xl/chartsheets/sheet1.xml':  xml('<chartsheet/>'),
}))

// The 1904 date system (old Mac Excel), prefixed element names, no styles part but for the date, and backslashed lower-case entry names.
writeFileSync(join(spreadsheet, 'date1904.xlsx'), zip({
  '_rels\\.rels':                 rootRels('xl/workbook.xml'),
  'xl\\workbook.xml':             xml(`<x:workbook xmlns:x="${NS}" xmlns:r="${REL}"><x:workbookPr date1904="1"/><x:sheets><x:sheet name="d" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`),
  'xl\\_rels\\workbook.xml.rels': rels([['rId1', 'worksheet', 'worksheets/sheet1.xml'], ['rId2', 'styles', 'styles.xml']]),
  'xl\\styles.xml':               xml(`<styleSheet xmlns="${NS}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`),
  'xl\\worksheets\\sheet1.xml':   xml(`<x:worksheet xmlns:x="${NS}"><x:sheetData><x:row r="1"><x:c r="A1" s="1"><x:v>44712</x:v></x:c></x:row></x:sheetData></x:worksheet>`),
}))

// A presentation, to be refused by readXlsx.
writeFileSync(join(pkg, 'presentation.pptx'), zip({
  '_rels/.rels':          rootRels('ppt/presentation.xml'),
  'ppt/presentation.xml': xml('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'),
}))
// An OpenDocument spreadsheet: a zip whose first entry names its type.
writeFileSync(join(pkg, 'sheet.ods'), zip({ 'mimetype': 'application/vnd.oasis.opendocument.spreadsheet', 'content.xml': xml('<office:document-content/>') }))
// OLE compound files: a legacy workbook, and an encrypted new one (it holds an EncryptionInfo stream).
const compound = extra => new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, ...new Uint8Array(504), ...extra])
writeFileSync(join(pkg, 'legacy.xls'), compound([...'Workbook'].flatMap(char => [char.codePointAt(0), 0])))
writeFileSync(join(pkg, 'encrypted.xlsx'), compound([...'EncryptionInfo'].flatMap(char => [char.codePointAt(0), 0])))
// A part whose header declares 16 bytes but inflates to a megabyte: fflate stops at the declared size.
const lying = zip({ '_rels/.rels': rootRels('xl/workbook.xml'), 'xl/workbook.xml': ' '.repeat(1024 * 1024) })
const view = new DataView(lying.buffer)
for (let offset = 0; offset < lying.length - 4; offset += 1) {
  const signature = view.getUint32(offset, true)
  const name = new TextDecoder().decode(lying.subarray(offset + (signature === 0x04_03_4B_50 ? 30 : 46), offset + (signature === 0x04_03_4B_50 ? 30 : 46) + 15))
  if (name !== 'xl/workbook.xml') continue
  if (signature === 0x04_03_4B_50) view.setUint32(offset + 22, 16, true)
  else if (signature === 0x02_01_4B_50) view.setUint32(offset + 24, 16, true)
}
writeFileSync(join(pkg, 'lying-size.xlsx'), lying)
