import { ExtractionScope } from './extraction-scope.model'

describe('ExtractionScope', () => {
  it('reads through the parent chain and shadows in the child', () => {
    const root = new ExtractionScope()
    root.set('links', ['/a', '/b'])
    root.set('title', 'root')
    const child = root.child()
    child.set('title', 'child')

    expect(child.get('links')).toEqual(['/a', '/b'])
    expect(child.get('title')).toBe('child')
    expect(root.get('title')).toBe('root')
    expect(child.has('missing')).toBe(false)
  })

  it('drops a child scope without touching the parent', () => {
    const root = new ExtractionScope()
    const first = root.child()
    first.set('raw', 'page 1')
    const second = root.child()

    expect(second.get('raw')).toBeUndefined()
    expect(root.has('raw')).toBe(false)
  })

  it('binds page state in the scope that navigated and inherits the rest', () => {
    const root = new ExtractionScope()
    root.setPage({ url: 'https://x/catalog', number: 1 })
    const page = root.child()
    page.setPage({ url: 'https://x/catalog?page=2', number: 2 })
    const item = page.child()
    item.setDocument({ kind: 'html', html: '<p/>' })

    expect(item.pageState).toEqual({ url: 'https://x/catalog?page=2', number: 2, document: { kind: 'html', html: '<p/>' } })
    expect(page.document).toBeUndefined()
    expect(root.pageState?.url).toBe('https://x/catalog')
  })

  it('snapshots the merged chain with page as { url, number }', () => {
    const root = new ExtractionScope()
    root.setPage({ url: 'https://x', number: 1 })
    root.set('a', 1)
    const child = root.child()
    child.set('b', 2)
    child.set('a', 3)

    expect(child.snapshot()).toEqual({ a: 3, b: 2, page: { url: 'https://x', number: 1 } })
  })

  it('looks up dotted paths into values and page state', () => {
    const scope = new ExtractionScope()
    scope.setPage({ url: 'https://x/p/1', number: 4 })
    scope.set('item', { href: '/p/2', tags: ['t'] })

    expect(scope.lookup('item.href')).toBe('/p/2')
    expect(scope.lookup('item.tags[0]')).toBe('t')
    expect(scope.lookup('page.url')).toBe('https://x/p/1')
    expect(scope.lookup('page.number')).toBe(4)
    expect(scope.lookup('item.nope.deeper')).toBeUndefined()
    expect(scope.lookup('nothing')).toBeUndefined()
  })

  it('appends to a list bound in a parent scope, as a new list', () => {
    const root = new ExtractionScope()
    root.set('ids', [1])
    const before = root.get('ids')
    const page = root.child()
    page.append('ids', [2, 3])
    expect(root.get('ids')).toEqual([1, 2, 3])
    expect(before).toEqual([1])
    expect(() => page.append('missing', [1])).toThrow('"missing" is not bound')
    root.set('text', 'x')
    expect(() => page.append('text', [1])).toThrow('"text" holds string, not a list')
  })
})
