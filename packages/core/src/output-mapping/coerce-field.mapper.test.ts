import { coerceValue, CoercionError } from './coerce-field.mapper'

describe('coerceValue', () => {
  it('converts scalars by declared type', () => {
    expect(coerceValue(12, { type: 'string' }, 'f')).toBe('12')
    expect(coerceValue('1,5', { type: 'number' }, 'f')).toBe(1.5)
    expect(coerceValue('7.9', { type: 'integer' }, 'f')).toBe(7)
    expect(coerceValue('yes', { type: 'boolean' }, 'f')).toBe(true)
    expect(coerceValue('2026-03-04T10:00:00Z', { type: 'date' }, 'f')).toBe('2026-03-04')
    expect(coerceValue('04.03.2026', { type: 'datetime', format: 'DD.MM.YYYY' }, 'f')).toBe('2026-03-04T00:00:00.000Z')
    expect(coerceValue('12 €', { type: 'currency' }, 'f')).toEqual({ amount: 12, currency: 'EUR' })
    expect(coerceValue({ amount: '3', currency: 'GBP' }, { type: 'currency', currency: 'EUR' }, 'f')).toEqual({ amount: 3, currency: 'EUR' })
    expect(coerceValue(' https://a.example/x ', { type: 'url' }, 'f')).toBe('https://a.example/x')
    expect(coerceValue(null, { type: 'url' }, 'f')).toBeNull()
  })

  it('handles arrays and objects recursively', () => {
    expect(coerceValue('one', { type: 'array', items: { type: 'string' } }, 'f')).toEqual(['one'])
    expect(coerceValue(['1', '2'], { type: 'array', items: { type: 'integer' } }, 'f')).toEqual([1, 2])
    expect(coerceValue({ a: '1', extra: true }, { type: 'object', fields: { a: { type: 'number' } } }, 'f')).toEqual({ a: 1 })
  })

  it('keeps a json field verbatim, whatever its shape, and refuses what JSON cannot hold', () => {
    const payload = { 'a': { b: [1, 'two', { c: null, d: true }] }, 'odd key': 1.5 }
    expect(coerceValue(payload, { type: 'json' }, 'f')).toBe(payload)
    expect(coerceValue([1, [2]], { type: 'json' }, 'f')).toEqual([1, [2]])
    expect(coerceValue('text', { type: 'json' }, 'f')).toBe('text')
    expect(() => coerceValue({ a: [1, NaN] }, { type: 'json' }, 'f')).toThrow('f.a[1]: NaN is not JSON')
    expect(() => coerceValue({ when: new Date(0) }, { type: 'json' }, 'f')).toThrow('f.when: Date is not JSON')
  })

  it('names the path in errors', () => {
    expect(() => coerceValue('nope', { type: 'url' }, 'images[1]')).toThrow(CoercionError)
    expect(() => coerceValue('nope', { type: 'url' }, 'images[1]')).toThrow(/^images\[1\]: /)
    expect(() => coerceValue('12', { type: 'currency' }, 'price')).toThrow(/no currency/)
    expect(() => coerceValue(['x'], { type: 'object', fields: {} }, 'o')).toThrow(/expected an object/)
    expect(() => coerceValue(['x'], { type: 'string' }, 's')).toThrow(/expected text, got a list/)
  })
})
