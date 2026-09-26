import { expandCharset, keepCharset } from './charset.algorithm'

describe('expandCharset', () => {
  it('expands ranges and keeps listed characters, once each', () => {
    expect(expandCharset('A-E0-3', true)).toBe('ABCDE0123')
    expect(expandCharset('ABCABC', true)).toBe('ABC')
    expect(expandCharset('-a-c_', true)).toBe('-abc_')
  })

  it('tests a RegExp class against every printable character', () => {
    expect(expandCharset(/[A-HJ-NP-Z2-9]/, true)).toBe('23456789ABCDEFGHJKLMNPQRSTUVWXYZ')
    expect(expandCharset(/\d/g, true)).toBe('0123456789')
  })

  it('adds the other case of each letter unless case-sensitive', () => {
    expect(expandCharset('ab2', false)).toBe('aAbB2')
    expect(expandCharset('ab2', true)).toBe('ab2')
  })

  it('refuses a charset that allows nothing, or a range that runs backwards', () => {
    expect(() => expandCharset(/\s/, true)).toThrow('allows no character')
    expect(() => expandCharset('z-a', true)).toThrow('the charset range z-a runs backwards')
  })
})

describe('keepCharset', () => {
  it('drops what the charset does not allow', () => {
    expect(keepCharset('Fd 8|3ZY', 'Fd83ZY')).toBe('Fd83ZY')
  })
})
