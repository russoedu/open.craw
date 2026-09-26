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
// incentivi.pptx reproduces what dealer decks do: titles placed only by their
// layout (and the master), a native table with a merged title row and a
// two-row header, a price grid built from grouped text boxes (the group
// scales its children), a bar chart whose data lives in its cache, speaker
// notes, a slide number to leave out, a hidden slide, and slides whose order
// in the presentation differs from their file names.
//
//   node packages/office-reader/tools/make-fixtures.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const spreadsheet = join(root, 'spreadsheet', 'fixtures')
const presentation = join(root, 'presentation', 'fixtures')
const pkg = join(root, 'ooxml-package', 'fixtures')

const NS = 'https://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'https://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'https://schemas.openxmlformats.org/package/2006/relationships'
const xml = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`
const rels = entries => xml(`<Relationships xmlns="${PKG_REL}">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`)
const rootRels = main => rels([['rId1', 'officeDocument', main]])

// A fixed date, so regenerating the fixtures leaves them byte for byte the same.
function zip (parts) {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, typeof text === 'string' ? strToU8(text) : text])), { mtime: '2026-06-01' })
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

// A presentation. EMU: 12 700 per point; the slide is 960 × 540 points (16:9).
const P = 'https://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'https://schemas.openxmlformats.org/drawingml/2006/main'
const C = 'https://schemas.openxmlformats.org/drawingml/2006/chart'
const pt = points => Math.round(points * 12_700)
const xfrm = (x, y, w, h, tag = 'a:xfrm') => `<${tag}><a:off x="${pt(x)}" y="${pt(y)}"/><a:ext cx="${pt(w)}" cy="${pt(h)}"/></${tag}>`
const paragraphs = text => text.split('\n').map(line => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`).join('')
const placeholder = (id, type, text, extra = '') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"${extra}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paragraphs(text)}</p:txBody></p:sp>`
const box = (id, x, y, w, h, text) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="box ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}</p:spPr><p:txBody><a:bodyPr/>${paragraphs(text)}</p:txBody></p:sp>`
const tree = shapes => `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld>`
const slideXml = (shapes, attributes = '') => xml(`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${REL}"${attributes}>${tree(shapes)}</p:sld>`)
const tc = (text, attributes = '') => `<a:tc${attributes}><a:txBody><a:bodyPr/>${paragraphs(text)}</a:txBody></a:tc>`
const tr = cells => `<a:tr h="${pt(20)}">${cells}</a:tr>`
const table = xml(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Tabella"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(60, 120, 840, 160, 'p:xfrm')}` +
  `<a:graphic><a:graphicData uri="${A}/table"><a:tbl><a:tblGrid><a:gridCol w="${pt(300)}"/><a:gridCol w="${pt(180)}"/><a:gridCol w="${pt(180)}"/><a:gridCol w="${pt(180)}"/></a:tblGrid>` +
  tr(tc('Incentivi giugno 2026', ' gridSpan="4"') + tc('', ' hMerge="1"') + tc('', ' hMerge="1"') + tc('', ' hMerge="1"')) +
  tr(tc('Modello', ' rowSpan="2"') + tc('Prezzo', ' gridSpan="2"') + tc('', ' hMerge="1"') + tc('Sconto', ' rowSpan="2"')) +
  tr(tc('', ' vMerge="1"') + tc('Listino') + tc('Netto') + tc('', ' vMerge="1"')) +
  tr(tc('Pandina') + tc('15.950 €') + tc('13.955 €') + tc('12,5%')) +
  tr(tc('Pandina Cross') + tc('17.950 €') + tc('15.706 €') + tc('12,5%')) +
  '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>').replace(/^<\?xml[^>]*>\n/, '')
// A price grid of text boxes inside a group whose child space is twice its size: children are placed at half their coordinates.
const grid = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="grid"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${pt(60)}" y="${pt(120)}"/><a:ext cx="${pt(600)}" cy="${pt(90)}"/><a:chOff x="0" y="0"/><a:chExt cx="${pt(1200)}" cy="${pt(180)}"/></a:xfrm></p:grpSpPr>` +
  [['Modello', 'Prezzo', 'Sconto'], ['Avenger', '24.950 €', '8%'], ['Compass', '39.900 €', '10%']]
    .map((cells, row) => cells.map((text, column) => box(11 + (row * 3) + column, column * 400, row * 60, 380, 50, text)).join('')).join('') +
  '</p:grpSp>'
const chartFrame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Grafico"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(60, 120, 600, 360, 'p:xfrm')}<a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame>`
const series = (name, values) => `<c:ser><c:idx val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
  '<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Aprile</c:v></c:pt><c:pt idx="1"><c:v>Maggio</c:v></c:pt><c:pt idx="2"><c:v>Giugno</c:v></c:pt></c:strCache></c:strRef></c:cat>' +
  `<c:val><c:numRef><c:f>Sheet1!$B$2:$B$4</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="3"/>${values.map((value, index) => (value === null ? '' : `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)).join('')}</c:numCache></c:numRef></c:val></c:ser>`
const chart = xml(`<c:chartSpace xmlns:c="${C}" xmlns:a="${A}"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Immatricolazioni</a:t></a:r></a:p></c:rich></c:tx></c:title>` +
  `<c:plotArea><c:barChart><c:barDir val="col"/>${series('Pandina', [1200, 1350.5, 1410])}${series('600e', [300, null, 410])}</c:barChart>` +
  '<c:catAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Mese</a:t></a:r></a:p></c:rich></c:tx></c:title></c:catAx></c:plotArea></c:chart></c:chartSpace>')
const notesShapes = placeholder(2, 'sldImg', '') + placeholder(3, 'body', 'Prezzi IVA inclusa.\nValidi fino al 30 giugno.') + placeholder(4, 'sldNum', '1')
const notes = xml(`<p:notes xmlns:p="${P}" xmlns:a="${A}">${tree(notesShapes)}</p:notes>`)
const layoutShapes = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(60, 30, 840, 60)}</p:spPr></p:sp>`
const layout = xml(`<p:sldLayout xmlns:p="${P}" xmlns:a="${A}">${tree(layoutShapes)}</p:sldLayout>`)
const masterShapes = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(40, 20, 880, 70)}</p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(60, 110, 840, 380)}</p:spPr></p:sp>`
const master = xml(`<p:sldMaster xmlns:p="${P}" xmlns:a="${A}">${tree(masterShapes)}</p:sldMaster>`)
const tableSlide = slideXml(placeholder(2, 'title', 'Incentivi giugno') + table + placeholder(5, 'sldNum', '1'))
const gridSlide = slideXml(placeholder(2, 'title', 'Griglia prezzi Jeep') + grid)
const chartSlide = slideXml(placeholder(2, 'title', 'Vendite') + placeholder(3, 'body', 'Fonte: UNRAE', ' idx="1"') + chartFrame)
const hiddenSlide = slideXml(placeholder(2, 'title', 'Bozza'), ' show="0"')
const presentationXml = xml(`<p:presentation xmlns:p="${P}" xmlns:r="${REL}"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId4"/><p:sldId id="258" r:id="rId5"/><p:sldId id="259" r:id="rId6"/></p:sldIdLst><p:sldSz cx="${pt(960)}" cy="${pt(540)}"/></p:presentation>`)
const slideRels = (...extra) => rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ...extra])

writeFileSync(join(presentation, 'incentivi.pptx'), zip({
  '_rels/.rels':                                  rootRels('ppt/presentation.xml'),
  'ppt/presentation.xml':                         presentationXml,
  'ppt/_rels/presentation.xml.rels':              rels([['rId3', 'slide', 'slides/slide4.xml'], ['rId4', 'slide', 'slides/slide1.xml'], ['rId5', 'slide', 'slides/slide2.xml'], ['rId6', 'slide', 'slides/slide3.xml']]),
  'ppt/slides/slide4.xml':                        tableSlide,
  'ppt/slides/_rels/slide4.xml.rels':             slideRels(['rId2', 'notesSlide', '../notesSlides/notesSlide1.xml']),
  'ppt/slides/slide1.xml':                        gridSlide,
  'ppt/slides/_rels/slide1.xml.rels':             slideRels(),
  'ppt/slides/slide2.xml':                        chartSlide,
  'ppt/slides/_rels/slide2.xml.rels':             slideRels(['rId2', 'chart', '../charts/chart1.xml']),
  'ppt/slides/slide3.xml':                        hiddenSlide,
  'ppt/slides/_rels/slide3.xml.rels':             slideRels(),
  'ppt/notesSlides/notesSlide1.xml':              notes,
  'ppt/charts/chart1.xml':                        chart,
  'ppt/slideLayouts/slideLayout1.xml':            layout,
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
  'ppt/slideMasters/slideMaster1.xml':            master,
}))
