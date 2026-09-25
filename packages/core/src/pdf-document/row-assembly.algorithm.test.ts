import { assembleRows } from './row-assembly.algorithm'

const run = (x: number, y: number, text: string, width = text.length * 3): { x: number, y: number, width: number, height: number, text: string } => ({ x, y, width, height: 7, text })

describe('assembleRows', () => {
  it('joins runs that nearly touch into one cell, and keeps columns apart', () => {
    const rows = assembleRows([run(40, 700, 'PANDA', 20), run(62, 700, '(model 319)', 30), run(218, 700, '19,0%')])
    expect(rows).toHaveLength(1)
    expect(rows[0].cells.map(cell => cell.text)).toEqual(['PANDA (model 319)', '19,0%'])
    expect(rows[0].text).toBe('PANDA (model 319)\t19,0%')
  })

  it('drops whitespace runs, which pdf.js emits across column gaps', () => {
    const rows = assembleRows([run(40, 700, 'PANDA', 20), run(60, 700, ' ', 158), run(218, 700, '19,0%')])
    expect(rows[0].cells.map(cell => cell.text)).toEqual(['PANDA', '19,0%'])
  })

  it('puts cells whose vertical extents overlap on one row, top to bottom', () => {
    const rows = assembleRows([run(40, 771, 'TOPOLINO'), run(220, 774, '0,0%'), run(40, 762, 'NEXT'), run(220, 762, '9,0%')])
    expect(rows.map(row => row.text)).toEqual(['TOPOLINO\t0,0%', 'NEXT\t9,0%'])
    expect(rows[0].top).toBe(781)
    expect(rows[0].bottom).toBe(771)
  })

  it('keeps lines one line-spacing apart as separate rows', () => {
    expect(assembleRows([run(40, 700, 'a'), run(40, 691, 'b')])).toHaveLength(2)
  })
})
