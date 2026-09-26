import { fixLetterCase } from './letter-case.algorithm'
import type { ReadSymbol } from './reader.contract'

/** A symbol on a line whose capitals are 60 px tall and whose baseline is at y = 100. */
function symbol (text: string, top: number, bottom = 100): ReadSymbol {
  return { text, confidence: 95, box: { x0: 0, y0: top, x1: 10, y1: bottom } }
}

const both = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

describe('fixLetterCase', () => {
  it('reads same-shape letters by their height against the capitals and digits', () => {
    const line = [symbol('8', 40), symbol('W', 40), symbol('W', 58), symbol('x', 40), symbol('x', 58), symbol('R', 40)]
    expect(fixLetterCase(line, both).map(read => read.text).join('')).toBe('8WwXxR')
  })

  it('reads p and y by a tail under the line', () => {
    const line = [symbol('5', 40), symbol('P', 58, 118), symbol('p', 40), symbol('Y', 58, 118), symbol('y', 40)]
    expect(fixLetterCase(line, both).map(read => read.text).join('')).toBe('5pPyY')
  })

  it('leaves letters alone when the charset allows one case, or when nothing measures the line', () => {
    expect(fixLetterCase([symbol('8', 40), symbol('W', 58)], 'W8').map(read => read.text).join('')).toBe('8W')
    expect(fixLetterCase([symbol('w', 40), symbol('x', 58)], both).map(read => read.text).join('')).toBe('wx')
  })
})
