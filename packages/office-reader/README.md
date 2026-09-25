# @opencraw/office-reader

Reads Office files into plain objects:

- **workbooks** (`.xlsx`, `.xlsm`) as sheets of cells, with their merged ranges and hidden rows;
- **presentations** (`.pptx`, `.pptm`, `.ppsx`) as slides of positioned text boxes, tables, chart data and
  speaker notes.

- **What the file holds, faithfully.** Formulas give their cached value, and nothing is evaluated. Dates are
  dates, in both the 1900 and 1904 systems. Merged ranges and hidden rows and sheets are reported, not
  guessed away.
- **Runs anywhere.** Two small dependencies ([fflate](https://github.com/101arrowz/fflate) and
  [htmlparser2](https://github.com/fb55/htmlparser2)), and no Node built-in except when you pass a path. It
  works in Node, browsers, workers and edge runtimes.
- **Safe on hostile files.** Zip entries are capped by size. XML entities a file declares are never expanded
  (no "billion laughs"), and no external entity is ever fetched (no XXE). Nothing in the file runs.

It is part of [OpenCraw](https://github.com/russoedu/open.craw), which uses it to crawl price lists and
incentive sheets, but it depends on nothing from it.

## Install

```sh
npm install @opencraw/office-reader
```

## Read a workbook

```ts
import { readXlsx } from '@opencraw/office-reader/xlsx'

const book = await readXlsx('./listino.xlsx')
for (const sheet of book.sheets) {
  console.log(sheet.name, sheet.rows.length)
}
```

```ts
// { date1904: false, sheets: [
//   { name: 'Incentivi giugno', hidden: false,
//     rows: [
//       ['Incentivi concessionari – giugno 2026'],
//       [],
//       ['Marca', 'Modello', 'Prezzo', null, 'Sconto', 'Valido dal', 'Attivo', 'Nota'],
//       [null, null, 'Listino', 'Netto'],
//       ['Fiat', 'Pandina', 15950, 13955.625, 0.125, Date(2026-06-01), true, 'Solo rottamazione'],
//       [null, 'Pandina Cross', 17950, 15706.25, 0.125, Date(2026-06-01T09:30), false, { error: '#DIV/0!' }],
//       …
//     ],
//     hiddenRows: [6],
//     merges: ['A1:H1', 'A3:A4', 'B3:B4', 'C3:D3', 'E3:E4', 'F3:F4', 'A5:A6'] },
//   { name: 'Archivio', hidden: true, … } ] }
```

### Sources

`readXlsx(source, options?)` takes any of these:

| Source | Notes |
|---|---|
| a path (`string`), or a `file:` `URL` | Node only. A string is always a path. |
| `Uint8Array`, `Buffer`, `ArrayBuffer`, any `ArrayBufferView` | |
| `Blob`, `File` | An upload in a browser or a server framework. |
| `ReadableStream<Uint8Array>` | `response.body` from `fetch`, for example. |
| any `AsyncIterable<Uint8Array>` | Node streams: `fs.createReadStream(path)`, a request body. |

It never fetches: pass `await (await fetch(url)).arrayBuffer()` or `response.body`.

### Options

| Option | Default | |
|---|---|---|
| `sheets` | all | A name, a `RegExp`, or `({ name, hidden }) => boolean`. Unselected sheets are never inflated. |
| `values` | `'typed'` | `'typed'` or `'text'` (below). |
| `limits` | 256 MiB per entry, 512 MiB per file | `{ entryBytes, totalBytes }`: what the zip entries may declare. |

### Values

| Cell | `values: 'typed'` | `values: 'text'` |
|---|---|---|
| text, rich text | `'Solo rottamazione'` | same |
| number | `13955.625` | `'13955.625'` (shortest round-trip form: `78.6`, not `78.599999999999994`) |
| percentage | `0.125` (display formats are not applied) | `'0.125'` |
| date / date-time | `Date` holding the wall-clock time as UTC | `'2026-06-01'` / `'2026-06-01T09:30:00'` |
| time of day | `Date` on Excel's day zero (`1899-12-30T12:00Z`) | `'12:00:00'` |
| boolean | `true` | `'true'` |
| error | `{ error: '#DIV/0!' }` | `'#DIV/0!'` |
| formula | its cached value, as above | same |
| empty | `null` | `''` |

Spreadsheets have no time zones, so a `Date` carries the wall-clock time in its UTC fields. Read it with
`getUTCHours()` or `toISOString()`, not `getHours()`.

### Sheets

Each sheet is `{ name, hidden, rows, hiddenRows, merges }`:

- `rows`: top to bottom from row 1. Each row runs to its last stored cell, so rows can be ragged and empty
  rows are `[]`.
- `hidden`: the sheet is hidden or very hidden in the workbook.
- `hiddenRows`: hidden rows, 0-based.
- `merges`: merged ranges as A1 references. A merged range's value sits in its **top-left cell only**, as the
  file stores it. To read the table a person sees, copy that value into every cell the range covers.
- Chart sheets hold no cells and are left out.

### Errors

A file that cannot be read throws `OfficeReadError`. Its `code` is one of the following, and its message
says what to do:

| `code` | The file is |
|---|---|
| `legacy-format` | a legacy binary `.xls`, `.ppt` or `.doc`: save it as `.xlsx` / `.pptx`, or export it as PDF |
| `encrypted` | password-protected |
| `unsupported-format` | an OpenDocument `.ods` / `.odp` |
| `not-xlsx` / `not-pptx` | a zip package of the other kind (a `.pptx` given to `readXlsx`, say) |
| `not-zip` | not a zip at all |
| `too-large` | past the `limits` |
| `malformed` | damaged: a part does not inflate |
| `bad-source` | not something to read bytes from (an `http:` URL, a text stream) |

## Read a presentation

```ts
import { readPptx } from '@opencraw/office-reader/pptx'

const deck = await readPptx('./incentivi.pptx')
```

```ts
// { width: 960, height: 540, slides: [
//   { number: 1, title: 'Incentivi giugno', hidden: false,
//     shapes: [{ x: 60, y: 30, width: 840, height: 60, text: 'Incentivi giugno', placeholder: 'title' }],
//     tables: [{ name: 'table 1', hidden: false,
//                rows: [['Incentivi giugno 2026', '', '', ''], ['Modello', 'Prezzo', '', 'Sconto'], ['', 'Listino', 'Netto', ''], …],
//                hiddenRows: [], merges: ['A1:D1', 'A2:A3', 'B2:C2', 'D2:D3'] }],
//     charts: [], notes: 'Prezzi IVA inclusa.\nValidi fino al 30 giugno.' },
//   { number: 3, title: 'Vendite', …,
//     charts: [{ type: 'bar', title: 'Immatricolazioni',
//                series: [{ name: 'Pandina', categories: ['Aprile', 'Maggio', 'Giugno'], values: [1200, 1350.5, 1410] }, …] }] },
//   …] }
```

`readPptx(source, options?)` takes the same sources as `readXlsx`. Its options:

| Option | Default | |
|---|---|---|
| `slides` | all | Numbers from 1 (`[2, 5]`), a `RegExp` on titles, or `({ number, title, hidden }) => boolean`. |
| `values` | `'typed'` | Chart values: numbers (`null` where a point is missing), or `'text'`. |
| `notes`, `charts` | `true` | `false` skips reading them. |
| `limits` | as above | |

What each slide holds:

- **`shapes`:** its text boxes in reading order (top to bottom, left to right), in points from the top-left
  corner.
  - A title or body placeholder with no position of its own takes the one its layout gives it, else the one
    its master gives it, the way PowerPoint draws it.
  - Boxes inside a group are placed through the group's scaling.
  - Slide numbers, dates and footers are left out.
- **`tables`:** its native tables as sheets, with their merged cells (`gridSpan`, `rowSpan`) as ranges. A
  cell inside a merge is `''`.
- **`charts`:** the type, the title and each series' name, categories and values, from the data the chart
  caches next to its formulas. The embedded workbook is not needed.
- **`notes`:** the speaker notes.
- **`hidden`:** hidden in a slideshow.

Slides come in presentation order, which is not always the order of the files inside the zip.

Tested against the 100 presentations of Apache POI's test corpus. It reads 90 of them (562 slides, 41 tables,
28 charts), and every placeholder gets a position. The other 10 are fuzzer cases and a truncated zip, all
refused with an `OfficeReadError`.

## How it compares

| | office-reader | SheetJS (`xlsx` on npm) | ExcelJS | read-excel-file |
|---|---|---|---|---|
| Merged ranges | yes | yes | yes | no |
| Hidden rows and sheets | yes | yes | yes | no |
| Error cells | `{ error }` | yes | yes | `null` |
| Dependencies | 2 | 7 | 9, including archiver and tmp | 4 |
| Browser, workers, edge | yes | yes | Node-first | yes |
| Writes files | no | yes | yes | no |

For presentations, no JavaScript library we found reads positions, tables and chart data. officeparser
returns flattened text, and the others are text-only or browser renderers.

SheetJS's npm copy (0.18.5) carries two high-severity advisories (prototype pollution, ReDoS); the fixed
versions are published on its own CDN only. Choose SheetJS or ExcelJS when you need to **write** workbooks,
evaluate formulas, or read `.xls` and `.ods`. This package only reads.

Tested against the 367 workbooks of Apache POI's test corpus, real files and fuzzer cases alike. It reads
350 of them and refuses the other 17 with an `OfficeReadError`: encrypted, truncated or corrupted files.

## Not supported

- **Writing files.**
- **Evaluating formulas, and applying display formats.** A percentage stays `0.125` and a price stays `15950`.
- **Legacy `.xls`, `.ppt`, `.xlsb` and OpenDocument `.ods` / `.odp`.** These are refused with a code.
- **In workbooks:** charts, pivot tables, images, comments and data validation.
- **In presentations:** SmartArt text, text inside images (no OCR), animations and themes.
