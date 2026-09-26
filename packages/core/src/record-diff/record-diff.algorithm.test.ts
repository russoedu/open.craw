import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OutputRecipe } from '../recipe-schema'
import { diffOptionsFor, diffRecords, readableKey } from './record-diff.algorithm'
import { readRecordsFile } from './records-file.repository'

const source = { recipeId: 'r', url: 'https://x/', emittedAt: '2026-06-01T00:00:00Z' }
const row = (model: string, trim: string, amount: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ model, trim, price: { amount, currency: 'EUR' }, scrapedAt: String(Math.random()), _source: source, ...extra })

describe('diffRecords', () => {
  it('reports added, removed and changed records by key, field by field, whatever the order', () => {
    const previous = [row('Pandina', 'Hybrid', 15_950), row('600e', 'La Prima', 36_950), row('Avenger', 'Summit', 24_950, { inStock: true })]
    const current = [row('Avenger', 'Summit', 23_950, { inStock: false }), row('Pandina', 'Hybrid', 15_950), row('Grande Panda', 'Icon', 18_950)]
    const diff = diffRecords(previous, current, { key: ['model', 'trim'], ignore: ['scrapedAt'] })
    expect([diff.added, diff.removed, diff.changed, diff.unchanged]).toEqual([1, 1, 1, 1])
    expect(diff.changes.map(change => [change.change, readableKey(change.key)])).toEqual([['removed', '600e · La Prima'], ['changed', 'Avenger · Summit'], ['added', 'Grande Panda · Icon']])
    expect(diff.changes[1]).toMatchObject({ fields: [{ field: 'price.amount', before: 24_950, after: 23_950 }, { field: 'inStock', before: true, after: false }] })
    expect(diff.shrunk).toBeUndefined()
  })

  it('uses the _key lines carry, ignores bookkeeping, and compares objects whatever their key order', () => {
    const previous = [{ _key: '["a"]', value: { x: 1, y: [1, 2] }, _source: { url: 'one' } }]
    const current = [{ _key: '["a"]', value: { y: [1, 2], x: 1 }, _source: { url: 'two' } }]
    expect(diffRecords(previous, current)).toMatchObject({ unchanged: 1, changes: [] })
    expect(() => diffRecords([{ value: 1 }], [])).toThrow('previous record 1 has no _key: name the fields that identify a record')
  })

  it('counts repeated keys, and flags a run that lost most of its records', () => {
    const previous = Array.from({ length: 10 }, (_, index) => ({ id: index }))
    const diff = diffRecords(previous, [{ id: 1 }, { id: 1 }, { id: 2 }], { key: ['id'] })
    expect(diff).toMatchObject({ repeated: 1, removed: 8, counts: { previous: 10, current: 3 }, shrunk: { previous: 10, current: 3 } })
    expect(diffRecords(previous, previous.slice(0, 6), { key: ['id'] }).shrunk).toBeUndefined()
  })

  it('takes the key and the fields to ignore from an output recipe', () => {
    const output = { kind: 'output', id: 'o', version: 1, fields: { model: { type: 'string', key: true }, trim: { type: 'string', key: true }, price: { type: 'number' }, scrapedAt: { type: 'datetime', generated: 'now' }, id: { type: 'string', generated: 'uuid' }, url: { type: 'url', generated: 'sourceUrl' } } } as unknown as OutputRecipe
    expect(diffOptionsFor(output)).toEqual({ key: ['model', 'trim'], ignore: ['scrapedAt', 'id'] })
  })

  it('reads a JSON Lines file, naming the line that is not a record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opencraw-diff-'))
    try {
      await writeFile(join(directory, 'good.jsonl'), '{"a":1}\n\n{"a":2}\n')
      await writeFile(join(directory, 'bad.jsonl'), '{"a":1}\n[1]\n')
      await expect(readRecordsFile(join(directory, 'good.jsonl'))).resolves.toEqual([{ a: 1 }, { a: 2 }])
      await expect(readRecordsFile(join(directory, 'bad.jsonl'))).rejects.toThrow(/bad\.jsonl:2: not a record/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
