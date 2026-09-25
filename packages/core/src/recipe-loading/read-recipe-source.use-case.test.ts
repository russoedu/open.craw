import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { readRecipeSource } from './read-recipe-source.use-case'

const lines = '{"id":"a"}\n{"id":"b"}\n'

function ids (documents: { content: unknown }[]): unknown[] {
  return documents.map(document => (document.content as { id: string }).id)
}

describe('readRecipeSource', () => {
  it('tells text from a path by its first character', async () => {
    expect(await readRecipeSource(lines)).toEqual([{ source: 'recipes:1', content: { id: 'a' } }, { source: 'recipes:2', content: { id: 'b' } }])
    expect(await readRecipeSource('  [{"id":"a"}]', 'mine')).toEqual([{ source: 'mine[0]', content: { id: 'a' } }])
    await expect(readRecipeSource('no/such/file.json')).rejects.toThrow(/ENOENT/)
  })

  it('reads .json and .jsonl files from a directory, labelled by path and line', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recipes-'))
    await writeFile(join(directory, 'b.jsonl'), lines)
    await writeFile(join(directory, 'a.json'), '{"id":"c"}')
    await writeFile(join(directory, 'notes.txt'), 'ignored')
    const documents = await readRecipeSource(directory)
    expect(ids(documents)).toEqual(['c', 'a', 'b'])
    expect(documents[2].source).toBe(`${join(directory, 'b.jsonl')}:2`)
  })

  it('reads every kind of bytes', async () => {
    const sources = [Buffer.from(lines), new TextEncoder().encode(lines), new TextEncoder().encode(lines).buffer, new Blob([lines]), Readable.from([Buffer.from(lines.slice(0, 5)), Buffer.from(lines.slice(5))]), new Blob([lines]).stream()]
    for (const source of sources) expect(ids(await readRecipeSource(source))).toEqual(['a', 'b'])
    const named = await readRecipeSource(new File([lines], 'mine.jsonl'))
    expect(named[1].source).toBe('mine.jsonl:2')
  })

  it('takes decoded objects and arrays mixing every form, in order', async () => {
    const documents = await readRecipeSource([{ id: 'x' }, lines, [Buffer.from('{"id":"y"}')]])
    expect(ids(documents)).toEqual(['x', 'a', 'b', 'y'])
    expect(documents.map(document => document.source)).toEqual(['recipes[0]', 'recipes[1]:1', 'recipes[1]:2', 'recipes[2][0]'])
  })

  it('refuses what is not a recipe source', async () => {
    await expect(readRecipeSource([42 as unknown as object])).rejects.toThrow('recipes[0]: not a recipe source')
  })
})
