import { readYaml } from './read-yaml.client'

describe('readYaml', () => {
  it('reads YAML 1.2: no Norway problem, dates stay text', async () => {
    const { data } = await readYaml('country: NO\nopen: yes\ndate: 2026-06-01\nprice: 12.5\nzip: 0123\n', 'a.yaml')
    expect(data).toEqual({ country: 'NO', open: 'yes', date: '2026-06-01', price: 12.5, zip: 123 })
  })

  it('stays on 1.2 when the document declares 1.1', async () => {
    const { data } = await readYaml('%YAML 1.1\n---\ncountry: NO\ny: 2\nzip: 0123\ndate: 2026-06-01\n', 'a.yaml')
    expect(data).toEqual({ country: 'NO', y: 2, zip: 123, date: '2026-06-01' })
  })

  it('keeps every scalar as written with scalars: text', async () => {
    const { data } = await readYaml('zip: 0123\nversion: 1.10\nopen: true\n', 'a.yaml', 'text')
    expect(data).toEqual({ zip: '0123', version: '1.10', open: 'true' })
  })

  it('applies merge keys and anchors', async () => {
    const { data } = await readYaml('base: &base { brand: Fiat, year: 2026 }\nmodel:\n  <<: *base\n  name: Pandina\n', 'a.yaml')
    expect(data).toEqual({ base: { brand: 'Fiat', year: 2026 }, model: { brand: 'Fiat', year: 2026, name: 'Pandina' } })
  })

  it('reads several documents as an array, and one as its value', async () => {
    expect(await readYaml('a: 1\n---\na: 2\n', 'a.yaml')).toEqual({ data: [{ a: 1 }, { a: 2 }], documents: 2, warnings: [] })
    expect(await readYaml('- 1\n- 2\n', 'a.yaml')).toEqual({ data: [1, 2], documents: 1, warnings: [] })
  })

  it('never builds values from custom tags: they read as plain values, with a warning', async () => {
    const { data, warnings } = await readYaml('x: !!js/function "function () { return 1 }"\n', 'a.yaml')
    expect(data).toEqual({ x: 'function () { return 1 }' })
    expect(warnings).toEqual([expect.stringMatching(/Unresolved tag/)])
  })

  it('refuses a billion laughs, duplicate keys and broken YAML, naming the source', async () => {
    const laughs = ['a: &a [x, x, x, x, x, x, x, x, x]', ...'bcdefgh'.split('').map((key, index) => `${key}: &${key} [${Array.from({ length: 9 }, () => `*${'abcdefgh'[index]}`).join(', ')}]`)].join('\n')
    await expect(readYaml(laughs, 'bomb.yaml')).rejects.toThrow(/bomb\.yaml: .*alias/i)
    await expect(readYaml('a: 1\na: 2\n', 'dup.yaml')).rejects.toThrow(/dup\.yaml: not YAML \(Map keys must be unique/)
    await expect(readYaml('a: [1, 2\n', 'bad.yaml')).rejects.toThrow(/bad\.yaml: not YAML/)
  })
})
