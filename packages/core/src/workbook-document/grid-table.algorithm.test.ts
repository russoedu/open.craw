import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvWorkbook } from './csv-workbook.mapper'
import { fillDown, findGridTables } from './grid-table.algorithm'
import type { Sheet, WorkbookDocument } from './workbook-document.model'

const bytes = readFileSync(join(__dirname, 'fixtures', 'listino.csv'))
const listino = csvWorkbook(new TextDecoder('windows-1252').decode(bytes), { name: 'listino', encoding: 'windows-1252' })

function book (...sheets: Sheet[]): WorkbookDocument {
  return { kind: 'workbook', sheets }
}

describe('findGridTables', () => {
  it('finds the header under a title, skips empty rows and ends at "until"', () => {
    const [table] = findGridTables(listino, { header: /^Marca Modello/i, until: /^Totale/i })
    expect(table.sheet).toBe('listino')
    expect(table.title).toBe('Marca')
    expect(table.header).toEqual(['Marca', 'Modello', 'Versione', 'Prezzo €', 'Sconto %'])
    expect(table.rows).toEqual([
      { 'Marca': 'Fiat', 'Modello': 'Pandina', 'Versione': '1.0 Hybrid "Cross"', 'Prezzo €': '15.950,00', 'Sconto %': '12,5' },
      { 'Marca': '', 'Modello': '', 'Versione': '1.0 Hybrid Icon', 'Prezzo €': '16.450,00', 'Sconto %': '12,5' },
      { 'Marca': 'Citroën', 'Modello': 'C3', 'Versione': 'Plus; automatica\nnuova', 'Prezzo €': '19.300,00', 'Sconto %': '8' },
      { 'Marca': 'Peugeot', 'Modello': '208', 'Versione': 'Allure', 'Prezzo €': '21.450,00', 'Sconto %': '' },
    ])
  })

  it('names columns by pattern, drops the others, and fills a group written once down its rows', () => {
    const [table] = findGridTables(listino, {
      header:   /^Marca/i,
      until:    /^Totale/i,
      columns:  { brand: /^Marca$/i, model: /^Modello$/i, price: /^Prezzo/i },
      fillDown: ['brand', 'model'],
    })
    expect(table.rows.slice(0, 2)).toEqual([
      { brand: 'Fiat', model: 'Pandina', price: '15.950,00' },
      { brand: 'Fiat', model: 'Pandina', price: '16.450,00' },
    ])
  })

  it('reads to the end of the sheet without "until", and "^$" ends a table at the first empty row', () => {
    expect(findGridTables(listino, { header: /^Marca/i })[0].rows.at(-1)).toMatchObject({ Marca: 'Totale' })
    const sheet: Sheet = { name: 's', rows: [['Model', 'Price'], ['A', '1'], [], ['Notes'], ['B', '2']] }
    expect(findGridTables(book(sheet), { header: /^Model/i, until: /^$/ })[0].rows).toEqual([{ Model: 'A', Price: '1' }])
  })

  it('reads several tables, each ending at the next header', () => {
    const sheet: Sheet = { name: 's', rows: [['Model', 'Price'], ['A', '1'], ['Model', 'Price'], ['B', '2'], ['C', '3']] }
    expect(findGridTables(book(sheet), { header: /^Model Price$/i }).map(table => table.rows.length)).toEqual([1, 2])
  })

  it('fills merged ranges and joins a header spread over two rows into each column\'s key', () => {
    const sheet: Sheet = {
      name: 'FZ 10.1',
      rows: [
        ['Brand', 'Model', 'Total', '', 'Electric', ''],
        ['', '', 'August', 'Share in %', 'August', 'Share in %'],
        ['ALFA ROMEO', 'GIULIA', '33', '7.7', '-', '-'],
        ['', 'JUNIOR', '192', '59.6', '74', '100'],
      ],
      merges: ['A1:A2', 'B1:B2', 'C1:D1', 'E1:F1', 'A3:A4'],
    }
    const [table] = findGridTables(book(sheet), { header: /^Brand Model/i, headerRows: 2 })
    expect(table.header).toEqual(['Brand', 'Model', 'Total August', 'Total Share in %', 'Electric August', 'Electric Share in %'])
    expect(table.rows[1]).toEqual({ 'Brand': 'ALFA ROMEO', 'Model': 'JUNIOR', 'Total August': '192', 'Total Share in %': '59.6', 'Electric August': '74', 'Electric Share in %': '100' })
  })

  it('keys a column with data but no header by its letter, drops an empty one, and numbers repeated headers', () => {
    const sheet: Sheet = { name: 's', rows: [['', 'Name', 'Price', 'Price', ''], ['', 'A', '1', '2', 'x']] }
    const [table] = findGridTables(book(sheet), { header: /^Name/i })
    expect(table.header).toEqual(['Name', 'Price', 'Price 2', 'E'])
  })

  it('skips hidden sheets and rows unless asked, and reads only the sheets that match', () => {
    const visible: Sheet = { name: 'Prices', rows: [['Model'], ['A'], ['B']], hiddenRows: [2] }
    const hidden: Sheet = { name: 'Old', hidden: true, rows: [['Model'], ['Z']] }
    const document = book(visible, hidden)
    expect(findGridTables(document, { header: /^Model$/i }).map(table => table.rows)).toEqual([[{ Model: 'A' }]])
    expect(findGridTables(document, { header: /^Model$/i, includeHidden: true }).map(table => table.rows.length)).toEqual([2, 1])
    expect(findGridTables(document, { header: /^Model$/i, includeHidden: true, sheet: /^old$/i }).map(table => table.sheet)).toEqual(['Old'])
  })
})

describe('fillDown', () => {
  it('fills blanks from the row above, only in the keys given', () => {
    expect(fillDown([{ a: 'x', b: '1' }, { a: '', b: '' }, { a: 'y', b: '' }], ['a'])).toEqual([{ a: 'x', b: '1' }, { a: 'x', b: '' }, { a: 'y', b: '' }])
  })
})
