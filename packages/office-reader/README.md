# @opencraw/office-reader

Reads Office files into plain objects. Workbooks (`.xlsx`, `.xlsm`) come back as sheets of cells with their
merged ranges and hidden rows. Presentations (`.pptx`) are coming next.

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
| `not-xlsx` | a zip package that is not a workbook (a `.pptx`, say) |
| `not-zip` | not a zip at all |
| `too-large` | past the `limits` |
| `malformed` | damaged: a part does not inflate |
| `bad-source` | not something to read bytes from (an `http:` URL, a text stream) |

## How it compares

| | office-reader | SheetJS (`xlsx` on npm) | ExcelJS | read-excel-file |
|---|---|---|---|---|
| Merged ranges | yes | yes | yes | no |
| Hidden rows and sheets | yes | yes | yes | no |
| Error cells | `{ error }` | yes | yes | `null` |
| Dependencies | 2 | 7 | 9, including archiver and tmp | 4 |
| Browser, workers, edge | yes | yes | Node-first | yes |
| Writes files | no | yes | yes | no |

SheetJS's npm copy (0.18.5) carries two high-severity advisories (prototype pollution, ReDoS); the fixed
versions are published on its own CDN only. Choose SheetJS or ExcelJS when you need to **write** workbooks,
evaluate formulas, or read `.xls` and `.ods`. This package only reads.

Tested against the 367 workbooks of Apache POI's test corpus, real files and fuzzer cases alike. It reads
350 of them and refuses the other 17 with an `OfficeReadError`: encrypted, truncated or corrupted files.

## Not supported

- **Writing files.**
- **Evaluating formulas, and applying display formats.** A percentage stays `0.125` and a price stays `15950`.
- **Legacy `.xls`, `.xlsb` and OpenDocument `.ods`.** These are refused with a code.
- **Charts, pivot tables, images, comments and data validation.**
