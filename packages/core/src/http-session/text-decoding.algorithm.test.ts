import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { charsetOf, decodeText } from './text-decoding.algorithm'

const fixtures = join(__dirname, '..', 'workbook-document', 'fixtures')
const UTF8 = /^utf-8$/

function fixture (name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtures, name)))
}

function utf8 (text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('decodeText', () => {
  it('follows a byte-order mark and drops it', () => {
    expect(decodeText(new Uint8Array([0xEF, 0xBB, 0xBF, 0x61]))).toEqual({ text: 'a', encoding: expect.stringMatching(UTF8) })
    const utf16 = decodeText(fixture('listino.tsv'))
    expect(utf16.encoding).toBe('utf-16le')
    expect(utf16.text.startsWith('Marke\tModell')).toBe(true)
    expect(utf16.text).toContain('Škoda')
    expect(decodeText(new Uint8Array([0xFE, 0xFF, 0x00, 0x61]))).toEqual({ text: 'a', encoding: 'utf-16be' })
  })

  it('falls back to Windows-1252 for text that is not UTF-8', () => {
    const { text, encoding } = decodeText(fixture('listino.csv'))
    expect(encoding).toBe('windows-1252')
    expect(text).toContain('Citroën')
    expect(text).toContain('Prezzo €')
    expect(text).toContain('autoveicoli – settembre')
  })

  it('keeps UTF-8 with a stray byte as UTF-8, instead of turning every accent into mojibake', () => {
    const bytes = new Uint8Array([...utf8('Citroën '), 0xFF])
    expect(decodeText(bytes)).toEqual({ text: 'Citroën �', encoding: expect.stringMatching(UTF8) })
  })

  it('honours the declared charset, and a recipe\'s encoding over it', () => {
    const latin = new Uint8Array([0x43, 0xE9])
    expect(decodeText(latin, { charset: 'ISO-8859-1' }).text).toBe('Cé')
    expect(decodeText(utf8('Cé'), { charset: 'utf8' }).text).toBe('Cé')
    expect(decodeText(latin, { charset: 'utf8', encoding: 'latin1' }).text).toBe('Cé')
    expect(decodeText(utf8('é'), { charset: 'no-such-charset' }).text).toBe('é')
    expect(() => decodeText(latin, { encoding: 'no-such-encoding' })).toThrow(/not an encoding/)
  })
})

describe('charsetOf', () => {
  it('reads the charset parameter of a content type', () => {
    expect(charsetOf('text/csv; charset=ISO-8859-1')).toBe('ISO-8859-1')
    expect(charsetOf('text/csv;charset="utf8"')).toBe('utf8')
    expect(charsetOf('text/csv')).toBeUndefined()
  })
})
