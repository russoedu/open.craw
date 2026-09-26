import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvWorkbook } from '@opencraw/core'
import { workbookReport } from './probe-report.mapper'
import { describeWorkbook } from './workbook-findings.mapper'

const bytes = readFileSync(join(__dirname, '..', '..', '..', 'core', 'src', 'workbook-document', 'fixtures', 'listino.csv'))
const listino = csvWorkbook(new TextDecoder('windows-1252').decode(bytes), { name: 'listino', encoding: 'windows-1252' })

describe('describeWorkbook', () => {
  it('reports how a CSV was read, its rows, and its header with a selector', () => {
    const findings = describeWorkbook(listino)
    expect(findings.csv).toEqual({ encoding: 'windows-1252', delimiter: ';' })
    expect(findings.sheets).toEqual([{ name: 'listino', hidden: false, rows: 9, columns: 5 }])
    expect(findings.rows[1]).toEqual({ sheet: 'listino', row: 3, text: 'Marca | Modello | Versione | Prezzo € | Sconto %' })
    expect(findings.headers).toEqual([{ sheet: 'listino', row: 3, text: 'Marca | Modello | Versione | Prezzo € | Sconto %', selector: '^Marca' }])
  })

  it('hints at a second header row when the header has merged cells, and leaves hidden sheets out of the rows', () => {
    const findings = describeWorkbook({
      kind:   'workbook',
      sheets: [
        { name: 'FZ', rows: [['Brand', 'Total', ''], ['', 'August', 'Share'], ['ALFA', '33', '7.7']], merges: ['A1:A2', 'B1:C1'] },
        { name: 'Old', hidden: true, rows: [['secret', 'x']] },
      ],
    })
    expect(findings.headers).toEqual([{ sheet: 'FZ', row: 1, text: 'Brand | Total', selector: '^Brand', hint: 'merged header cells: try "headerRows": 2' }, { sheet: 'FZ', row: 2, text: 'August | Share', selector: '^August' }])
    expect(findings.rows.map(row => row.sheet)).toEqual(['FZ', 'FZ', 'FZ'])
    expect(findings.sheets[1]).toEqual({ name: 'Old', hidden: true, rows: 1, columns: 2 })
  })
})

describe('workbookReport', () => {
  it('names the encoding and the delimiter, and lists headers before rows', () => {
    const report = workbookReport('http://x/listino.csv', describeWorkbook(listino))
    expect(report.split('\n', 1)[0]).toBe('http://x/listino.csv (CSV, windows-1252, delimited by semicolons)')
    expect(report).toContain('  listino r3  ^Marca\n        Marca | Modello | Versione | Prezzo € | Sconto %')
    expect(report.indexOf('Likely table headers')).toBeLessThan(report.indexOf('First rows'))
  })
})
