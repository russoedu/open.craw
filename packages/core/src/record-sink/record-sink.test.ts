import { readFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OutputRecord } from '../output-mapping'
import { DedupePolicy } from './dedupe.policy'
import { jsonLinesSink } from './json-lines-sink.repository'
import { memorySink } from './memory-sink.repository'

const output = { kind: 'output' as const, id: 'o', version: 1, fields: {} }
const record = (url: string, key: string | null = `["${url}"]`): OutputRecord => ({ data: { url }, key, source: { recipeId: 'r', url, emittedAt: '2026-01-01T00:00:00.000Z' } })

describe('memorySink', () => {
  it('collects records and counts them', async () => {
    const sink = memorySink()
    await sink.open(output)
    await sink.write(record('a'))
    await sink.write(record('b'))
    expect(sink.records.map(item => item.data.url)).toEqual(['a', 'b'])
    expect(await sink.close()).toEqual({ written: 2 })
  })
})

describe('jsonLinesSink', () => {
  it('writes one JSON object per line with the source attached', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sink-'))
    const path = join(directory, 'out', 'records.jsonl')
    const sink = jsonLinesSink(path)
    await sink.open(output)
    await sink.write(record('a'))
    await sink.write(record('b'))
    const summary = await sink.close()
    expect(summary).toEqual({ written: 2, location: path })
    const content = await readFile(path, 'utf8')
    const lines = content.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ url: 'a', _source: { recipeId: 'r', url: 'a', emittedAt: '2026-01-01T00:00:00.000Z' } })
  })

  it('appends and remembers the keys already there, so a resumed run can skip them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sink-'))
    const path = join(directory, 'records.jsonl')
    const first = jsonLinesSink(path, { append: true })
    await first.open(output)
    expect(await first.has?.('["a"]')).toBe(false)
    await first.write(record('a'))
    await first.write(record('n', null))
    expect(await first.has?.('["a"]')).toBe(true)
    await first.close()
    const second = jsonLinesSink(path, { append: true })
    await second.open(output)
    expect(await second.has?.('["a"]')).toBe(true)
    expect(await second.has?.('["b"]')).toBe(false)
    await second.write(record('b'))
    expect(await second.close()).toEqual({ written: 1, location: path })
    const content = await readFile(path, 'utf8')
    const lines = content.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map(line => [line.url, line._key])).toEqual([['a', '["a"]'], ['n', undefined], ['b', '["b"]']])
    const memory = memorySink()
    await memory.write(record('a'))
    expect(await memory.has?.('["a"]')).toBe(true)
    expect(await memory.has?.('["z"]')).toBe(false)
  })

  it('refuses to write before open', async () => {
    await expect(jsonLinesSink('/tmp/never.jsonl').write(record('a'))).rejects.toThrow(/before open/)
  })
})

describe('DedupePolicy', () => {
  it('drops repeated keys across recipes under run scope, first wins', () => {
    const policy = new DedupePolicy('run')
    policy.startRecipe()
    expect(policy.isDuplicate(record('a'))).toBe(false)
    policy.startRecipe()
    expect(policy.isDuplicate(record('a'))).toBe(true)
    expect(policy.isDuplicate(record('b'))).toBe(false)
  })

  it('forgets keys per recipe under recipe scope and never dedupes under off or without a key', () => {
    const perRecipe = new DedupePolicy('recipe')
    perRecipe.startRecipe()
    expect(perRecipe.isDuplicate(record('a'))).toBe(false)
    perRecipe.startRecipe()
    expect(perRecipe.isDuplicate(record('a'))).toBe(false)
    const off = new DedupePolicy('off')
    expect(off.isDuplicate(record('a'))).toBe(false)
    expect(off.isDuplicate(record('a'))).toBe(false)
    expect(new DedupePolicy().isDuplicate(record('a', null))).toBe(false)
    expect(new DedupePolicy().isDuplicate(record('a', null))).toBe(false)
  })
})
