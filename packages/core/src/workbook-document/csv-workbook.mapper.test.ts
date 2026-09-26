import { csvWorkbook, sheetNameOf } from './csv-workbook.mapper'
import { workbookText } from './workbook-document.model'

describe('csvWorkbook', () => {
  it('reads one sheet, detecting the delimiter, and records how it was read', () => {
    expect(csvWorkbook('a;b\n1;2\n', { name: 'prices', encoding: 'utf8' })).toEqual({
      kind:   'workbook',
      sheets: [{ name: 'prices', rows: [['a', 'b'], ['1', '2']] }],
      csv:    { encoding: 'utf8', delimiter: ';' },
    })
  })

  it('takes the delimiter a recipe gives, and refuses one that is not a character', () => {
    expect(csvWorkbook('a;b|c\n', { name: 's', encoding: 'utf8', delimiter: '|' }).sheets[0].rows).toEqual([['a;b', 'c']])
    expect(() => csvWorkbook('a', { name: 's', encoding: 'utf8', delimiter: '||' })).toThrow(/one character/)
  })
})

describe('sheetNameOf', () => {
  it('names the sheet after the file', () => {
    expect(sheetNameOf('https://example.com/export/prezzo_alle_8.csv?x=1')).toBe('prezzo_alle_8')
    expect(sheetNameOf('file:///tmp/Listino%20giugno.csv')).toBe('Listino giugno')
    expect(sheetNameOf('https://example.com/')).toBe('csv')
  })
})

describe('workbookText', () => {
  it('joins cells by tabs and sheets by a blank line, leaving hidden sheets and rows out', () => {
    expect(workbookText({
      kind:   'workbook',
      sheets: [
        { name: 'a', rows: [['1', '2'], ['x'], ['3']], hiddenRows: [1] },
        { name: 'b', rows: [['secret']], hidden: true },
        { name: 'c', rows: [['4']] },
      ],
    })).toBe('1\t2\n3\n\n4')
  })
})
