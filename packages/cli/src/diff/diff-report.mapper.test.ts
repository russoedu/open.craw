import { diffRecords } from '@opencraw/core'
import { diffReport } from './diff-report.mapper'

describe('diffReport', () => {
  it('counts, warns, and lists each change with its fields before and after', () => {
    const previous = [{ model: 'Pandina', price: 15_950 }, { model: '600e', price: 36_950 }, { model: 'Avenger', price: 24_950 }, { model: 'Topolino', price: 9890 }]
    const current = [{ model: 'Pandina', price: 14_950 }]
    const lines = diffReport(diffRecords(previous, current, { key: ['model'] }), 2)
    expect(lines).toEqual([
      '0 added, 3 removed, 1 changed, 0 unchanged (4 records before, 1 now)',
      '! 1 records where the previous run had 4: if the source did not shrink, the site may have changed and the recipe no longer finds everything',
      '- 600e',
      '- Avenger',
      '… and 2 more',
    ])
    expect(diffReport(diffRecords(previous, current, { key: ['model'] })).at(-1)).toBe('~ Pandina  price: 15950 → 14950')
  })
})
