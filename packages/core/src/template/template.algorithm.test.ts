import { hasPlaceholder, render, renderDeep, renderText } from './template.algorithm'
import { isTruthy, stringify } from './value-text.algorithm'

const scope: Record<string, unknown> = { link: '/p/1', item: { href: '/p/2', tags: ['a', 'b'] }, page: { number: 2 }, empty: '' }
const lookup = (path: string): unknown => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], scope)

describe('render', () => {
  it('returns the raw value for a whole-string placeholder', () => {
    expect(render('{{item.tags}}', lookup)).toEqual(['a', 'b'])
    expect(render('{{ page.number }}', lookup)).toBe(2)
  })

  it('interpolates into surrounding text', () => {
    expect(render('https://x{{link}}?p={{page.number}}', lookup)).toBe('https://x/p/1?p=2')
  })

  it('renders unknown and empty values as empty text', () => {
    expect(render('a{{missing}}b{{empty}}c', lookup)).toBe('abc')
    expect(render('{{missing}}', lookup)).toBeUndefined()
  })

  it('leaves text without placeholders untouched', () => {
    expect(render('plain', lookup)).toBe('plain')
    expect(hasPlaceholder('plain')).toBe(false)
    expect(hasPlaceholder('{{a}}')).toBe(true)
  })

  it('renders every string inside an object or array with renderDeep', () => {
    const values: Record<string, unknown> = { a: 'A', n: 3 }
    const deepLookup = (path: string): unknown => values[path]
    expect(renderDeep({ x: '{{a}}', y: ['{{n}}', 'n={{n}}', 2, false, null], z: { deep: '{{a}}!' } }, deepLookup)).toEqual({ x: 'A', y: [3, 'n=3', 2, false, null], z: { deep: 'A!' } })
    expect(renderDeep(undefined, deepLookup)).toBeUndefined()
  })
})

describe('renderText', () => {
  it('stringifies a single non-text value', () => {
    expect(renderText('{{page.number}}', lookup)).toBe('2')
    expect(renderText('{{item.tags}}', lookup)).toBe('["a","b"]')
  })
})

describe('isTruthy', () => {
  it('follows recipe semantics', () => {
    expect(isTruthy(undefined)).toBe(false)
    expect(isTruthy(null)).toBe(false)
    expect(isTruthy('')).toBe(false)
    expect(isTruthy(' false ')).toBe(false)
    expect(isTruthy('0')).toBe(false)
    expect(isTruthy(0)).toBe(false)
    expect(isTruthy([])).toBe(false)
    expect(isTruthy('yes')).toBe(true)
    expect(isTruthy(['x'])).toBe(true)
    expect(isTruthy({})).toBe(true)
    expect(isTruthy(1)).toBe(true)
  })
})

describe('stringify', () => {
  it('renders primitives and JSON for objects', () => {
    expect(stringify(3)).toBe('3')
    expect(stringify(true)).toBe('true')
    expect(stringify({ a: 1 })).toBe('{"a":1}')
    expect(stringify(null)).toBe('')
  })
})
