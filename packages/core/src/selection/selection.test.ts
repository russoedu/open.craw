import { selectHtml } from './html-selector.algorithm'
import { selectJson } from './json-path.algorithm'
import { collapse, takeFromHtml, takeFromJson } from './take-value.mapper'

const html = `<!doctype html><html lang="en"><body>
  <h1>  Blue   Shoe </h1>
  <a class="product" href="/p/1">one</a><a class="product" href="/p/2">two</a>
  <input id="qty" value="3">
  <table class="variants"><tr><td class="size">M</td><td class="price">10,00 €</td></tr></table>
</body></html>`

describe('selectHtml + takeFromHtml', () => {
  it('selects many and takes text, attributes, html and values', () => {
    const links = selectHtml(html, 'a.product')
    expect(links.map(match => takeFromHtml(match, 'attr:href'))).toEqual(['/p/1', '/p/2'])
    expect(takeFromHtml(selectHtml(html, 'h1')[0], 'text')).toBe('Blue Shoe')
    expect(takeFromHtml(selectHtml(html, '#qty')[0], 'value')).toBe('3')
    expect(takeFromHtml(selectHtml(html, 'table.variants tr')[0], 'html')).toContain('<td class="size">M</td>')
    expect(takeFromHtml(selectHtml(html, 'h1')[0], 'attr:missing')).toBeUndefined()
  })

  it('keeps table cells and list items when given a fragment', () => {
    const row = '<td class="year">1995</td><td class="role"><a href="/movie/949-heat"><bdi>Heat</bdi></a> <span class="character">Vincent</span></td>'
    expect(takeFromHtml(selectHtml(row, 'td.year')[0], 'text')).toBe('1995')
    expect(takeFromHtml(selectHtml(row, 'td.role a')[0], 'attr:href')).toBe('/movie/949-heat')
    const item = '<li class="griditem" title="The Godfather (1972) as Michael"><div data-item-name="The Godfather (1972)"></div></li>'
    expect(takeFromHtml(selectHtml(item, 'li.griditem')[0], 'attr:title')).toBe('The Godfather (1972) as Michael')
    expect(takeFromHtml(selectHtml(item, 'div')[0], 'attr:data-item-name')).toBe('The Godfather (1972)')
  })

  it('returns an empty list when nothing matches', () => {
    expect(selectHtml(html, '.nothing')).toEqual([])
  })
})

describe('selectJson + takeFromJson', () => {
  const document = { items: [{ url: '/a', price: 1 }, { url: '/b', price: 2 }], nextPage: null }

  it('evaluates JSONPath and takes values', () => {
    expect(selectJson(document, '$.items[*].url')).toEqual(['/a', '/b'])
    expect(selectJson(document, '$.items[*]')).toHaveLength(2)
    expect(selectJson(document, '$.nextPage')).toEqual([null])
    expect(selectJson(document, '$.missing')).toEqual([])
    expect(takeFromJson({ a: 1 }, 'json')).toEqual({ a: 1 })
    expect(takeFromJson({ a: 1 }, 'text')).toBe('{"a":1}')
    expect(takeFromJson(2, 'text')).toBe('2')
    expect(takeFromJson(null, 'text')).toBeUndefined()
  })
})

describe('collapse', () => {
  it('collapses whitespace', () => {
    expect(collapse('  a \n\t b  ')).toBe('a b')
  })
})
