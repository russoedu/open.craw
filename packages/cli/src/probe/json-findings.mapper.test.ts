import { describeJson } from './json-findings.mapper'
import { jsonReport } from './probe-report.mapper'

const catalogue = {
  meta: { 'total': 3, 'next-page': null },
  data: {
    products: [
      { id: 1, name: 'Pandina', price: 15_950, tags: ['city'] },
      { id: 2, name: '600e', price: 36_950 },
      { id: 3, name: 'Avenger', price: 24_950, brand: 'Jeep' },
    ],
    dealers: [{ city: 'Torino', code: 'T1' }, { city: 'Milano', code: 'M1' }],
  },
}

describe('describeJson', () => {
  it('finds the record lists, largest first, with the keys every entry shares', () => {
    const findings = describeJson(catalogue, 'json')
    expect(findings.type).toBe('object')
    expect(findings.lists).toEqual([
      { path: '$.data.products[*]', length: 3, keys: ['id', 'name', 'price'] },
      { path: '$.data.dealers[*]', length: 2, keys: ['city', 'code'] },
    ])
  })

  it('draws the structure with a sample per leaf, quoting keys that are not identifiers', () => {
    const { tree } = describeJson(catalogue, 'json')
    expect(tree).toEqual(expect.arrayContaining([
      '$.meta  object',
      '$.meta.total  number 3',
      "$.meta['next-page']  null",
      '$.data.products  array (3) of object',
      '$.data.products[*].name  string "Pandina"',
      '$.data.products[*].tags  array (1) of string',
    ]))
  })

  it('reads a top-level list, as JSON Lines give', () => {
    const findings = describeJson([{ a: 1 }, { a: 2 }], 'jsonl')
    expect(findings).toMatchObject({ format: 'jsonl', type: 'array (2) of object', lists: [{ path: '$[*]', length: 2, keys: ['a'] }] })
    expect(jsonReport('x.jsonl', findings).split('\n', 1)[0]).toBe('x.jsonl (JSON Lines: array (2) of object)')
  })
})
