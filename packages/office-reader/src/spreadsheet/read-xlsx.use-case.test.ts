import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readXlsx } from './read-xlsx.use-case'
import type { ReadXlsxOptions } from './read-xlsx.use-case'
import type { Sheet } from './workbook.model'

const incentivi = join(__dirname, 'fixtures', 'incentivi.xlsx')
const packages = join(__dirname, '..', 'ooxml-package', 'fixtures')

async function firstSheet (options?: ReadXlsxOptions): Promise<Sheet> {
  const book = await readXlsx(incentivi, options)

  return book.sheets[0]
}

async function sheetNames (sheets: ReadXlsxOptions['sheets']): Promise<string[]> {
  const book = await readXlsx(incentivi, { sheets })

  return book.sheets.map(sheet => sheet.name)
}

describe('readXlsx', () => {
  it('reads every worksheet in order, leaving the chart sheet out, with merges and hidden rows and sheets', async () => {
    const book = await readXlsx(incentivi)
    expect(book.date1904).toBe(false)
    expect(book.sheets.map(sheet => [sheet.name, sheet.hidden])).toEqual([['Incentivi giugno', false], ['Archivio', true], ['Maggio', false]])
    const [sheet] = book.sheets
    expect(sheet.hiddenRows).toEqual([6])
    expect(sheet.merges).toEqual(['A1:H1', 'A3:A4', 'B3:B4', 'C3:D3', 'E3:E4', 'F3:F4', 'A5:A6'])
    expect(sheet.rows[2]).toEqual(['Marca', 'Modello', 'Prezzo', null, 'Sconto', 'Valido dal', 'Attivo', 'Nota'])
  })

  it('reads typed values: cached formula results, percentages as fractions, dates, booleans, rich text, errors', async () => {
    const sheet = await firstSheet()
    expect(sheet.rows[4]).toEqual(['Fiat', 'Pandina', 15_950, 13_955.625, 0.125, new Date('2026-06-01T00:00:00Z'), true, 'Solo rottamazione'])
    expect(sheet.rows[5]).toEqual([null, 'Pandina Cross', 17_950, 15_706.25, 0.125, new Date('2026-06-01T09:30:00Z'), false, { error: '#DIV/0!' }])
    expect(sheet.rows[7]).toEqual(['Jeep', 'Avenger', 24_950.5])
    expect(sheet.rows[8]).toEqual(['Consegna', null, new Date('1899-12-30T12:00:00Z'), 1.5, null, null, null, 78.6, '東京'])
  })

  it('reads canonical text', async () => {
    const sheet = await firstSheet({ values: 'text' })
    expect(sheet.rows[5]).toEqual(['', 'Pandina Cross', '17950', '15706.25', '0.125', '2026-06-01T09:30:00', 'false', '#DIV/0!'])
    expect(sheet.rows[8]).toEqual(['Consegna', '', '12:00:00', '1.5', '', '', '', '78.6', '東京'])
  })

  it('reads only the sheets asked for, by name, pattern or test', async () => {
    expect(await firstSheet({ sheets: 'Maggio', values: 'text' })).toEqual({ name: 'Maggio', hidden: false, rows: [['Mese', 'Totale'], ['2026-05-01', '42']], hiddenRows: [], merges: [] })
    expect(await sheetNames(/^incentivi/i)).toEqual(['Incentivi giugno'])
    expect(await sheetNames(sheet => !sheet.hidden)).toEqual(['Incentivi giugno', 'Maggio'])
  })

  it('reads the 1904 date system, prefixed elements and backslashed entry names', async () => {
    const bytes = readFileSync(join(__dirname, 'fixtures', 'date1904.xlsx'))
    const book = await readXlsx(new Blob([bytes]))
    expect(book).toEqual({ date1904: true, sheets: [{ name: 'd', hidden: false, rows: [[new Date('2026-06-01T00:00:00Z')]], hiddenRows: [], merges: [] }] })
  })

  it('refuses what is not a workbook, saying what it is', async () => {
    await expect(readXlsx(join(packages, 'presentation.pptx'))).rejects.toMatchObject({ code: 'not-xlsx', message: expect.stringMatching(/readPptx/) })
    await expect(readXlsx(join(packages, 'legacy.xls'))).rejects.toMatchObject({ code: 'legacy-format' })
    await expect(readXlsx(join(packages, 'sheet.ods'))).rejects.toMatchObject({ code: 'unsupported-format' })
  })
})
