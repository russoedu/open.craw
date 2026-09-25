import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfDocument } from './pdf-document.model'
import { findTables } from './pdf-table.algorithm'
import { readPdf } from './read-pdf.client'
import { assembleRows } from './row-assembly.algorithm'

const columns = { model: /^MODELS/i, discount: /^(Discount|\(PROMO)/i, excluded: /^Excluded/i, extra: /^Extra/i }
const fixture = join(__dirname, 'fixtures', 'discounts.pdf')
let document: PdfDocument

beforeAll(async () => {
  document = await readPdf(new Uint8Array(readFileSync(fixture)))
})

function run (x: number, y: number, text: string): { x: number, y: number, width: number, height: number, text: string } {
  return { x, y, width: text.length * 3, height: 7, text }
}

describe('findTables', () => {
  it('finds every table by its header row, ends it at "until", and names it by its first header cell', () => {
    const tables = findTables(document, { header: /^MODELS/i, until: /^(NOTE|\*)/i, columns })
    expect(tables.map(table => [table.page, table.title, table.rows.length])).toEqual([[1, 'MODELS ALPHA', 6], [1, 'MODELS BETA', 2], [1, 'MODELS DELTA (DEALERS ONLY)', 2], [2, 'MODELS GAMMA', 2]])
    expect(tables[0].header).toEqual(['MODELS ALPHA', 'Discount %*', 'Excluded versions', 'Extra *'])
  })

  it('reads columns from the body under centred headers, values a few points off their label included', () => {
    const [alpha] = findTables(document, { header: /^MODELS ALPHA/i, until: /^NOTE/i, columns })
    expect(alpha.rows.slice(0, 3)).toEqual([
      { model: 'CITY (model 101)', discount: '19,0%', excluded: '', extra: '+3% registration bonus' },
      { model: 'CITY EV (model 102)', discount: '3,0%', excluded: '', extra: '' },
      { model: 'MINI (model 103)', discount: '0,0%', excluded: '', extra: '1000 euro scrappage bonus' },
    ])
  })

  it('regroups cells wrapped over several lines: a list above and below its row, a name around centred values', () => {
    const [alpha] = findTables(document, { header: /^MODELS ALPHA/i, until: /^NOTE/i, columns })
    expect(alpha.rows[3]).toEqual({ model: 'SEDAN (model 104)', discount: '16,0%', excluded: 'Special 100 edition 104.8RU-Top Sport 104.LRU', extra: '' })
    expect(alpha.rows[4]).toEqual({ model: 'WAGON base series 1 (104.E23 without OPT JFS-JFR)', discount: '12,0%', excluded: '', extra: '3% stock bonus' })
  })

  it('maps columns in order, so a short note far from its header still lands under it', () => {
    const [beta] = findTables(document, { header: /^MODELS BETA/i, until: /^MODELS/i, columns })
    expect(beta.rows).toEqual([{ model: 'ROADSTER', discount: '20,0%', extra: '+ 3% trade-in' }, { model: 'VAN', discount: '18,5%', extra: '+ 2% trade-in' }])
  })

  it('gives a header over two columns both of them', () => {
    const [delta] = findTables(document, { header: /^MODELS DELTA/i, columns })
    expect(delta.rows[0]).toEqual({ model: 'TRUCK 290', discount: '18,0% M1/M2', extra: 'Extra 2% trade-in' })
  })

  it('hands a note line halfway between two rows to the row below', () => {
    const [gamma] = findTables(document, { header: /^MODELS GAMMA/i, until: /^\*/i, columns })
    expect(gamma.rows).toEqual([
      { model: 'G3 MHEV', discount: '7,0%', extra: '+ Eu 800 trade-in _ Eu 1500 stock until 30/09/26' },
      { model: 'G3 BEV', discount: '5,0%', extra: '+ Eu 1000 trade-in _ Eu 1500 stock until 30/09/26' },
    ])
  })

  it('keys rows by the header texts without "columns", and follows an explicit alignment', () => {
    const rows = assembleRows([run(40, 700, 'Model'), run(200, 700, 'Price'), run(40, 690, 'Long name'), run(200, 690, '10'), run(40, 681, 'continued'), run(40, 672, 'Short'), run(200, 672, '20')])
    const page = { number: 1, width: 595, height: 842, rows }
    const top = findTables({ kind: 'pdf', pages: [page] }, { header: /^Model/, align: 'top' })
    expect(top[0].rows).toEqual([{ Model: 'Long name continued', Price: '10' }, { Model: 'Short', Price: '20' }])
    const bottom = findTables({ kind: 'pdf', pages: [page] }, { header: /^Model/, align: 'bottom' })
    expect(bottom[0].rows).toEqual([{ Model: 'Long name', Price: '10' }, { Model: 'continued Short', Price: '20' }])
  })
})
