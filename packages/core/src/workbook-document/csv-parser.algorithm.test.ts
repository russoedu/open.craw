import { detectDelimiter, parseCsv } from './csv-parser.algorithm'

describe('parseCsv', () => {
  it('reads quoted fields: the delimiter, line breaks and doubled quotes inside them', () => {
    expect(parseCsv('a,b\n"x, y","line one\nline two"\n"say ""hi""",z\n', ',')).toEqual([
      ['a', 'b'],
      ['x, y', 'line one\nline two'],
      ['say "hi"', 'z'],
    ])
  })

  it('takes a quote inside an unquoted field literally', () => {
    expect(parseCsv('Fiat;1.0 Hybrid "Cross";15.950,00\n', ';')).toEqual([['Fiat', '1.0 Hybrid "Cross"', '15.950,00']])
  })

  it('ends records at CRLF, LF or CR, and adds no row for a trailing line break', () => {
    expect(parseCsv('a\r\nb\nc\rd', ',')).toEqual([['a'], ['b'], ['c'], ['d']])
    expect(parseCsv('a,b\r\n', ',')).toEqual([['a', 'b']])
  })

  it('keeps ragged rows, empty fields and surrounding spaces as read', () => {
    expect(parseCsv('a,b,c\n1\n,, x \n\n', ',')).toEqual([['a', 'b', 'c'], ['1'], ['', '', ' x '], ['']])
  })

  it('reads an unterminated quote to the end of the text', () => {
    expect(parseCsv('a,"open\nstill', ',')).toEqual([['a', 'open\nstill']])
  })
})

describe('detectDelimiter', () => {
  it.each([
    ['semicolons with decimal commas', 'model;price\nPanda;15.950,00\nC3;19.300,00\n', ';'],
    ['tabs', 'a\tb\n1\t2\n', '\t'],
    ['commas, with semicolons inside quoted text', 'name,desc\nA,"x; y; z"\nB,"p; q"\n', ','],
    ['a single column', 'name\nx\ny\n', ','],
    ['pipes under a title line', 'Estrazione del 2026-09-24\nid|price\n1|2\n3|4\n', '|'],
    ['semicolons with quoted commas', 'a;b\n"1,5";"x, y"\n2;3\n', ';'],
  ])('finds %s', (_label, text, delimiter) => {
    expect(detectDelimiter(text)).toBe(delimiter)
  })

  it('scores only the first lines of a long file', () => {
    const text = `a;b\n${'1;2\n'.repeat(20_000)}`
    expect(detectDelimiter(text)).toBe(';')
  })
})
