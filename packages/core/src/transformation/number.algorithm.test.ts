import { parseBoolean, parseInteger, parseNumber } from './number.algorithm'
import { TransformError } from './transform.error'

describe('parseNumber', () => {
  it('reads plain and locale-formatted numbers', () => {
    expect(parseNumber('1234.5')).toBe(1234.5)
    expect(parseNumber('1,234.50')).toBe(1234.5)
    expect(parseNumber('1.234,50', 'de-DE')).toBe(1234.5)
    expect(parseNumber('1 234,50', 'fr-FR')).toBe(1234.5)
    expect(parseNumber('€ 1.299,00', 'de-DE')).toBe(1299)
    expect(parseNumber('$1,299')).toBe(1299)
    expect(parseNumber('-3', undefined)).toBe(-3)
    expect(parseNumber(7)).toBe(7)
  })

  it('guesses the decimal separator without a locale', () => {
    expect(parseNumber('10,00')).toBe(10)
    expect(parseNumber('1.299')).toBe(1299)
    expect(parseNumber('1.299,5')).toBe(1299.5)
  })

  it('rejects text without a number', () => {
    expect(() => parseNumber('n/a')).toThrow(TransformError)
    expect(() => parseNumber(null)).toThrow(/expects text/)
  })
})

describe('parseInteger', () => {
  it('truncates', () => {
    expect(parseInteger('12.9')).toBe(12)
  })
})

describe('parseBoolean', () => {
  it('uses the default phrases and a custom list', () => {
    expect(parseBoolean('In Stock (3 left)')).toBe(true)
    expect(parseBoolean('Sold out')).toBe(false)
    expect(parseBoolean('Available now', ['available'])).toBe(true)
    expect(parseBoolean('yes', ['ja'])).toBe(false)
    expect(parseBoolean(1)).toBe(true)
    expect(parseBoolean(false)).toBe(false)
    expect(parseBoolean(undefined)).toBe(false)
  })
})
