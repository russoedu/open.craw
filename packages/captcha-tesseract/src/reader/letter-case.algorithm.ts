import type { ReadSymbol } from './reader.contract'

/** Letters whose small and capital forms have the same shape: only their height tells them apart. */
const SAME_SHAPE = new Set('cosuvwxz')
/** Letters whose small form has a tail under the line, and whose capital does not. */
const TAILED = new Set('py')
/** Small letters that reach under the line: not used to find it. */
const DESCENDERS = new Set('gjpqy')
/** Characters as tall as a capital: digits and capitals. */
const CAPITAL_HEIGHT = /^[\dA-Z]$/

/**
 * Puts right the case of letters that Tesseract, reading one line with no
 * reference, cannot tell by shape: `c`/`C`, `o`/`O`, `s`/`S`, `v`/`V`, `w`/`W`,
 * `x`/`X`, `z`/`Z` by their height against the line's capitals and digits,
 * `p`/`P` and `y`/`Y` by a tail under the line. (`j`/`J` are left: many
 * fonts drop the capital under the line too.) Only letters whose two cases
 * the charset both allows are changed; a line with no capital or digit to
 * measure against is left as read.
 *
 * Like telling `o` from `O` in a handwritten code by comparing it with the `8`
 * next to it.
 *
 * @param symbols - The characters read, with their boxes.
 * @param characters - The charset.
 * @returns The characters, with their case put right.
 */
export function fixLetterCase (symbols: readonly ReadSymbol[], characters: string): ReadSymbol[] {
  const boxed = symbols.filter(symbol => symbol.box !== undefined)
  const capitals = boxed.filter(symbol => CAPITAL_HEIGHT.test(symbol.text) && !SAME_SHAPE.has(symbol.text.toLowerCase()) && !TAILED.has(symbol.text.toLowerCase()))
  if (capitals.length === 0) return [...symbols]
  const capital = median(capitals.map(symbol => heightOf(symbol)))
  // Either case of a tailed letter may be misread, so neither helps find the line.
  const baseline = median(boxed.filter(symbol => !DESCENDERS.has(symbol.text.toLowerCase())).map(symbol => symbol.box?.y1 ?? 0))

  return symbols.map((symbol) => {
    const lower = symbol.text.toLowerCase()
    const upper = symbol.text.toUpperCase()
    if (lower === upper || symbol.box === undefined || !characters.includes(lower) || !characters.includes(upper)) return symbol
    if (SAME_SHAPE.has(lower)) {
      const ratio = heightOf(symbol) / capital
      if (ratio >= 0.86) return { ...symbol, text: upper }
      if (ratio <= 0.8) return { ...symbol, text: lower }
    }
    if (TAILED.has(lower)) return { ...symbol, text: symbol.box.y1 > baseline + (capital * 0.12) ? lower : upper }

    return symbol
  })
}

function heightOf (symbol: ReadSymbol): number {
  return symbol.box === undefined ? 0 : symbol.box.y1 - symbol.box.y0
}

function median (values: number[]): number {
  // A copy, sorted in place: the package targets ES2022, which has no toSorted.
  const sorted = Float64Array.from(values).sort()

  return sorted[Math.floor(sorted.length / 2)] ?? 0
}
