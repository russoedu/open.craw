import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffTool } from './diff-tool.handler'
import type { DiffResult } from './diff-tool.handler'

describe('diff tool', () => {
  it('compares two runs by key and returns the counts, the report and the changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mcp-diff-'))
    try {
      await writeFile(join(directory, 'a.jsonl'), '{"model":"Pandina","price":15950}\n{"model":"600e","price":36950}\n')
      await writeFile(join(directory, 'b.jsonl'), '{"model":"Pandina","price":14950}\n{"model":"Avenger","price":24950}\n')
      const result = await diffTool({ previous: join(directory, 'a.jsonl'), current: join(directory, 'b.jsonl'), key: ['model'] })
      const diff = result.structuredContent as unknown as DiffResult
      expect(diff).toMatchObject({ added: 1, removed: 1, changed: 1, unchanged: 0 })
      expect(diff.summary).toContain('~ Pandina  price: 15950 → 14950')
      expect(diff.changes.map(change => change.change)).toEqual(['removed', 'changed', 'added'])
      const missing = await diffTool({ previous: join(directory, 'a.jsonl'), current: join(directory, 'b.jsonl') })
      expect(missing).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('has no _key') }] })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
