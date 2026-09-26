import { formatKinds } from './number-formats.mapper'

function kinds (...codes: (number | string)[]): string[] {
  const custom = codes.map((code, index) => (typeof code === 'string' ? `<numFmt numFmtId="${200 + index}" formatCode="${code}"/>` : '')).join('')
  const xfs = codes.map((code, index) => `<xf numFmtId="${typeof code === 'string' ? 200 + index : code}"/>`).join('')

  return formatKinds(`<styleSheet><numFmts>${custom}</numFmts><cellXfs>${xfs}</cellXfs></styleSheet>`)
}

describe('formatKinds', () => {
  it('knows the built-in date and time formats', () => {
    expect(kinds(0, 2, 10, 14, 22, 18, 20, 46)).toEqual(['number', 'number', 'number', 'date', 'date', 'time', 'time', 'time'])
  })

  it('reads custom codes: months against minutes, quoted text, locales and colours ignored, elapsed time as a number', () => {
    expect(kinds('dd/mm/yyyy', 'mmm-yy', '[$-410]mmmm', 'h:mm', 'mm:ss', 'hh:mm AM/PM', '[h]:mm', '#,##0.00 &quot;dm&quot;', '[Red]0.00', 'General')).toEqual([
      'date', 'date', 'date', 'time', 'time', 'time', 'number', 'number', 'number', 'number',
    ])
  })

  it('is empty without styles', () => {
    expect(formatKinds('')).toEqual([])
  })
})
