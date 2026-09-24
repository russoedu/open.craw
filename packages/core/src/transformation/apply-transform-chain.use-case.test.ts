import { HookRegistry } from '../hooks'
import type { TransformRule } from '../recipe-schema'
import { applyTransformChain } from './apply-transform-chain.use-case'
import type { TransformContext } from './transform-registry.store'
import { TransformError } from './transform.error'

const scope: Record<string, unknown> = { raw_price: ' 1.299,00 € ', page: { url: 'https://shop.example/p/1' } }
const context: TransformContext = {
  recipeId: 'r',
  scope,
  lookup:   path => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], scope),
  hooks:    new HookRegistry({ positive: (input: unknown) => Number(input) > 0, double: async (input: unknown) => Number(input) * 2 }),
  baseUrl:  'https://shop.example/p/1',
  log:      () => {},
}

async function run (value: unknown, ...rules: TransformRule[]): Promise<unknown> {
  return applyTransformChain(value, rules, context)
}

describe('applyTransformChain', () => {
  it('chains string and number ops', async () => {
    expect(await run(' 1.299,00 € ', { op: 'trim' }, { op: 'regex', pattern: String.raw`([\d.,]+)` }, { op: 'currency', locale: 'de-DE' })).toEqual({ amount: 1299 })
    expect(await run('Blue Shoe', { op: 'lowercase' }, { op: 'replace', pattern: ' ', replacement: '-' })).toBe('blue-shoe')
    expect(await run("'Air SR' 58kWh", { op: 'replace', pattern: "^'([^']+)' ", replacement: '$1: ' })).toBe('Air SR: 58kWh')
    expect(await run('ab', { op: 'replace', pattern: 'b', replacement: '[$&]' })).toBe('a[b]')
    expect(await run('a,b,c', { op: 'split', separator: ',' }, { op: 'last' })).toBe('c')
  })

  it('applies scalar ops to every item of a list and list ops to the list', async () => {
    expect(await run(['/a', '/b', '/a'], { op: 'absoluteUrl' }, { op: 'unique' })).toEqual(['https://shop.example/a', 'https://shop.example/b'])
    expect(await run(['1', '2'], { op: 'number' }, { op: 'sum' })).toBe(3)
    expect(await run([['a'], ['b', ['c']]], { op: 'flatten' }, { op: 'count' })).toBe(3)
    expect(await run(['12', '50'], { op: 'join', separator: '.' }, { op: 'number' })).toBe(12.5)
    expect(await run([null, '', 'x'], { op: 'coalesce' })).toBe('x')
    expect(await run(['a', 'b'], { op: 'concat', separator: '+' })).toBe('a+b')
    expect(await run(['a', 'b', 'c'], { op: 'slice', start: 1 }, { op: 'nth', index: 0 })).toBe('b')
    expect(await run(['a'], { op: 'first' })).toBe('a')
  })

  it('handles default, template, jsonpath, date and boolean', async () => {
    expect(await run(undefined, { op: 'default', value: 'n/a' })).toBe('n/a')
    expect(await run('kept', { op: 'default', value: 'n/a' })).toBe('kept')
    expect(await run(null, { op: 'template', value: '{{page.url}}#{{raw_price}}' })).toBe('https://shop.example/p/1# 1.299,00 € ')
    expect(await run({ items: [{ id: 1 }, { id: 2 }] }, { op: 'jsonpath', path: '$.items[*].id' })).toEqual([1, 2])
    expect(await run('04/03/2026', { op: 'date', format: 'DD/MM/YYYY' })).toEqual(new Date('2026-03-04T00:00:00Z'))
    expect(await run('In stock', { op: 'boolean', truthy: ['in stock'] })).toBe(true)
    expect(await run('12.7', { op: 'integer' })).toBe(12)
  })

  it('calls hooks, sync or async, with the value so far', async () => {
    expect(await run('3', { op: 'integer' }, { op: 'hook', name: 'positive' })).toBe(true)
    expect(await run('3', { op: 'integer' }, { op: 'hook', name: 'double' })).toBe(6)
    await expect(run('3', { op: 'hook', name: 'missing' })).rejects.toThrow(/unknown hook "missing"/)
  })

  it('reports the failing op', async () => {
    await expect(run({ a: 1 }, { op: 'trim' })).rejects.toThrow(TransformError)
    await expect(run('abc', { op: 'regex', pattern: '(a)', group: 3 })).rejects.toThrow(/no group 3/)
    expect(await run('abc', { op: 'regex', pattern: '(x)' })).toBeUndefined()
    expect(await run(undefined, { op: 'trim' }, { op: 'absoluteUrl' })).toBeUndefined()
    expect(await run(null, { op: 'number' }, { op: 'default', value: 0 })).toBe(0)
    await expect(run('x', { op: 'sum' })).rejects.toThrow(/expects a list/)
  })
})
