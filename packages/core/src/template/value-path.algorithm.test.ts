import { getPath, segmentsOf, setPath } from './value-path.algorithm'

describe('segmentsOf', () => {
  it('normalises bracket indexes into dotted segments', () => {
    expect(segmentsOf('items[0].url')).toEqual(['items', '0', 'url'])
    expect(segmentsOf('items.0.url')).toEqual(['items', '0', 'url'])
  })

  it('treats an empty path and a dot as the root', () => {
    expect(segmentsOf('')).toEqual([])
    expect(segmentsOf('.')).toEqual([])
  })
})

describe('getPath', () => {
  const source = { seller: { name: 'Ann' }, items: [{ url: '/a' }, { url: '/b' }], count: 0 }

  it('reads nested values and array indexes', () => {
    expect(getPath(source, 'seller.name')).toBe('Ann')
    expect(getPath(source, 'items[1].url')).toBe('/b')
    expect(getPath(source, 'count')).toBe(0)
  })

  it('returns the source for the root path', () => {
    expect(getPath(source, '.')).toBe(source)
  })

  it('returns undefined instead of throwing on a missing segment', () => {
    expect(getPath(source, 'seller.address.city')).toBeUndefined()
    expect(getPath(null, 'a')).toBeUndefined()
    expect(getPath('text', 'length.x')).toBeUndefined()
  })
})

describe('setPath', () => {
  it('creates intermediate objects and arrays', () => {
    const target: Record<string, unknown> = {}
    setPath(target, 'seller.name', 'Ann')
    setPath(target, 'variants.0.size', 'M')
    expect(target).toEqual({ seller: { name: 'Ann' }, variants: [{ size: 'M' }] })
  })

  it('overwrites a leaf and keeps siblings', () => {
    const target: Record<string, unknown> = { seller: { name: 'Ann', id: 1 } }
    setPath(target, 'seller.name', 'Bob')
    expect(target).toEqual({ seller: { name: 'Bob', id: 1 } })
  })

  it('ignores an empty path', () => {
    const target: Record<string, unknown> = { a: 1 }
    setPath(target, '', 2)
    expect(target).toEqual({ a: 1 })
  })
})
