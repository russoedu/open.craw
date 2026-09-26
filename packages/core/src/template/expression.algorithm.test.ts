import { evaluateExpression, parseExpression } from './expression.algorithm'
import { render } from './template.algorithm'
import { getPath } from './value-path.algorithm'

const scope: Record<string, unknown> = {
  price:  12.5,
  qty:    '3',
  name:   '  Blue Shoe ',
  tags:   ['a', 'b'],
  item:   { 'href': '/p/2', 'display-name': 'Item 2', '@type': 'Movie', 'nested': { n: 4 } },
  empty:  '',
  flag:   false,
  fn:     () => 'called',
  nothin: undefined,
}
const lookup = (path: string): unknown => (path === '' ? undefined : getPath(scope, path))
const run = (source: string): unknown => evaluateExpression(parseExpression(source), lookup)

describe('expressions', () => {
  it('does arithmetic with precedence, parentheses and numeric text', () => {
    expect(run('price * qty')).toBe(37.5)
    expect(run('1 + 2 * 3')).toBe(7)
    expect(run('(1 + 2) * 3')).toBe(9)
    expect(run('10 % 4 - -1')).toBe(3)
    expect(run('price / 0')).toBeUndefined()
    expect(run('name * 2')).toBeUndefined()
    expect(run('1.5e2 + .5')).toBe(150.5)
  })

  it('concatenates with + unless both sides are numbers', () => {
    expect(run("'x-' + qty")).toBe('x-3')
    expect(run('price + qty')).toBe('12.53')
    expect(run("'a' + missing + 'b'")).toBe('ab')
  })

  it('compares loosely and orders numbers numerically, text lexically', () => {
    expect(run('qty == 3')).toBe(true)
    expect(run("qty != '3'")).toBe(false)
    expect(run('missing == null')).toBe(true)
    expect(run('tags == tags')).toBe(true)
    expect(run('qty > 10')).toBe(false)
    expect(run("'b' > 'a'")).toBe(true)
    expect(run('price >= 12.5 && price <= 13')).toBe(true)
  })

  it('applies recipe truthiness to logic, not and the ternary', () => {
    expect(run("empty || 'fallback'")).toBe('fallback')
    expect(run("flag && 'never'")).toBe(false)
    expect(run("'0' ? 'yes' : 'no'")).toBe('no')
    expect(run('tags ? len(tags) : 0')).toBe(2)
    expect(run('!empty')).toBe(true)
    expect(run("missing ?? empty ?? 'x'")).toBe('')
    expect(run("price > 10 ? 'dear' : price > 5 ? 'fair' : 'cheap'")).toBe('dear')
  })

  it('calls the known functions', () => {
    expect(run('trim(name)')).toBe('Blue Shoe')
    expect(run('upper(trim(name))')).toBe('BLUE SHOE')
    expect(run('lower(name)')).toBe('  blue shoe ')
    expect(run("default(empty, 'n/a')")).toBe('n/a')
    expect(run('round(price * 1.2, 1)')).toBe(15)
    expect(run("number(' 4.5 ')")).toBe(4.5)
    expect(run("join(tags, '|')")).toBe('a|b')
    expect(run('first(tags) + last(tags)')).toBe('ab')
    expect(run(String.raw`replace(name, '\s+', '')`)).toBe('BlueShoe')
    expect(run("contains(tags, 'a') && contains(name, 'Shoe')")).toBe(true)
    expect(run("urlEncode('A#1 b&c+d é')")).toBe('A%231%20b%26c%2Bd%20%C3%A9')
    expect(run("len(split('a,b,c', ','))")).toBe(3)
    // blank text is an empty list, and blank pieces are dropped: a forEach over a blank var runs no iteration
    expect(run("split('', ',')")).toEqual([])
    expect(run("split(' a , ,b,', ',')")).toEqual(['a', 'b'])
    // An object keyed by name, walked as a list; anything else gives nothing to walk
    expect(run('entries(item.nested)')).toEqual([{ key: 'n', value: 4 }])
    expect(run('keys(item.nested)')).toEqual(['n'])
    expect(run('values(item.nested)')).toEqual([4])
    expect(run('entries(tags)')).toEqual([{ key: '0', value: 'a' }, { key: '1', value: 'b' }])
    expect(run("entries('text')")).toEqual([])
    expect(run('len(item)')).toBe(0)
  })

  it('reads paths with indexes and keywords', () => {
    expect(run('item.nested.n + tags.length')).toBe(6)
    expect(run("item.nested.n + '' + tags.length")).toBe('42')
    expect(run('tags[1]')).toBe('b')
    expect(run('true ? null : false')).toBeNull()
  })

  it('reports where a bad expression breaks', () => {
    expect(() => parseExpression('1 +')).toThrow('unexpected end at 3 in "1 +"')
    expect(() => parseExpression('(1 + 2')).toThrow('expected ")" at 6')
    expect(() => parseExpression('a ? b')).toThrow('expected ":"')
    expect(() => parseExpression('1 # 2')).toThrow('unexpected "#" at 2')
    expect(() => parseExpression("'open")).toThrow('unterminated string at 0')
    expect(() => parseExpression('explode(1)')).toThrow('unknown function "explode"')
    expect(() => parseExpression('1 2')).toThrow('unexpected token at 2')
    expect(() => parseExpression(`${'('.repeat(70)}1${')'.repeat(70)}`)).toThrow('nested too deeply')
    expect(() => parseExpression(Array.from({ length: 600 }, () => '1').join('+'))).toThrow('too long')
  })

  it('never reaches code: functions in scope, prototypes and constructors are nothing', () => {
    expect(run('fn')).toBeUndefined()
    expect(run("fn + ''")).toBe('')
    expect(run('constructor')).toBeUndefined()
    expect(run('item.constructor')).toBeUndefined()
    expect(run('item.__proto__')).toBeUndefined()
    expect(run('name.toString')).toBeUndefined()
    expect(run('tags.map')).toBeUndefined()
    expect(() => parseExpression("constructor.constructor('return 1')()")).toThrow('unknown function')
    expect(() => parseExpression('item.nested.n()')).toThrow('unknown function')
    expect(getPath({ a: 1 }, 'hasOwnProperty')).toBeUndefined()
    expect(getPath({ a: 1 }, '__proto__.polluted')).toBeUndefined()
  })
})

describe('render with expressions', () => {
  it('keeps plain paths on the direct route, including hyphens and @', () => {
    expect(render('{{item.display-name}}', lookup)).toBe('Item 2')
    expect(render('{{item.@type}}', lookup)).toBe('Movie')
    expect(render('{{}}', lookup)).toBeUndefined()
    expect(render('{{price-1}}', lookup)).toBeUndefined()
  })

  it('evaluates anything else, typed when the placeholder is the whole string', () => {
    expect(render('{{price - 1}}', lookup)).toBe(11.5)
    expect(render('{{ price * qty }}', lookup)).toBe(37.5)
    expect(render("{{ empty ? 'a' : 'b' }}", lookup)).toBe('b')
    expect(render('total: {{round(price * qty, 0)}} for {{len(tags)}} tags', lookup)).toBe('total: 38 for 2 tags')
    expect(render("{{ item.href ?? '/none' }}?q={{ upper(trim(name)) }}", lookup)).toBe('/p/2?q=BLUE SHOE')
    expect(() => render('{{ price + }}', lookup)).toThrow('unexpected end')
  })
})
