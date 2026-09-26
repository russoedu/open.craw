/** The printable ASCII characters a RegExp charset is tested against. */
const PRINTABLE = Array.from({ length: 0x7E - 0x21 + 1 }, (_, index) => String.fromCodePoint(0x21 + index))

/**
 * The characters a captcha may use, as one string without repeats: what
 * Tesseract is limited to (`tessedit_char_whitelist`) and what a read is
 * filtered through.
 *
 * A string lists characters, with `a-z` style ranges (`'A-Za-z0-9'`,
 * `'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`); a `-` first or last is itself. A
 * RegExp is a one-character class (`/[A-HJ-NP-Z2-9]/`), tested against every
 * printable ASCII character. Unless `caseSensitive`, each letter brings its
 * other case: a case-blind site draws either.
 *
 * @param charset - The list, or the class.
 * @param caseSensitive - Whether `a` and `A` are different characters.
 * @returns The characters.
 * @throws Error when the charset allows nothing.
 */
export function expandCharset (charset: string | RegExp, caseSensitive: boolean): string {
  const listed = typeof charset === 'string' ? expandRanges(charset) : PRINTABLE.filter(character => new RegExp(charset.source, charset.flags.replaceAll('g', '')).test(character))
  const characters = new Set(caseSensitive ? listed : listed.flatMap(character => [character, character.toLowerCase(), character.toUpperCase()]))
  if (characters.size === 0) throw new Error(`the charset ${String(charset)} allows no character`)

  return [...characters].join('')
}

/**
 * A read kept to the charset: characters outside it (a stray `|` for an `l`, a
 * space) are dropped.
 *
 * @param text - What Tesseract read.
 * @param characters - From {@link expandCharset}.
 * @returns The filtered read.
 */
export function keepCharset (text: string, characters: string): string {
  return [...text].filter(character => characters.includes(character)).join('')
}

function expandRanges (list: string): string[] {
  const characters: string[] = []
  const chars = [...list]
  for (let index = 0; index < chars.length; index += 1) {
    const from = chars[index]
    const to = chars[index + 2]
    if (to !== undefined && chars[index + 1] === '-') {
      const start = from.codePointAt(0) ?? 0
      const end = to.codePointAt(0) ?? 0
      if (end < start) throw new Error(`the charset range ${from}-${to} runs backwards`)
      for (let code = start; code <= end; code += 1) characters.push(String.fromCodePoint(code))
      index += 2
    } else {
      characters.push(from)
    }
  }

  return characters
}
