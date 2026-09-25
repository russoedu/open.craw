/** Decoded text and the encoding it was read as. */
export interface DecodedText {
  text:     string
  encoding: string
}

/**
 * Decodes a body, in this order: a byte-order mark (UTF-8, UTF-16 LE/BE; Excel's
 * "Unicode text" export is UTF-16 LE), the encoding a recipe asks for, the
 * charset the server declares, strict UTF-8, and Windows-1252 (a superset of
 * Latin-1) for text that is not UTF-8.
 *
 * The Windows-1252 fallback is only taken when the text holds no valid UTF-8
 * beyond ASCII: a UTF-8 page with one stray byte keeps its accents, with a
 * replacement character for the stray byte, instead of turning every accent
 * into mojibake.
 *
 * @param bytes - The body.
 * @param options - `encoding`: the recipe's choice, a WHATWG label (wins over
 * the charset, not over a BOM); `charset`: from the content type (ignored when
 * not a known label).
 * @returns The text, without its BOM, and the encoding used.
 * @throws Error when `encoding` is not a known label.
 */
export function decodeText (bytes: Uint8Array, options: { encoding?: string, charset?: string } = {}): DecodedText {
  const bom = bomOf(bytes)
  if (bom !== undefined) return decodeWith(new TextDecoder(bom), bytes)
  if (options.encoding !== undefined) {
    const decoder = decoderFor(options.encoding)
    if (decoder === undefined) throw new Error(`"${options.encoding}" is not an encoding this runtime knows (try utf8, windows-1252, iso-8859-15, utf-16le, shift_jis…)`)

    return decodeWith(decoder, bytes)
  }
  const declared = options.charset === undefined ? undefined : decoderFor(options.charset)
  if (declared !== undefined) return decodeWith(declared, bytes)
  try {
    return decodeWith(new TextDecoder('utf-8', { fatal: true }), bytes)
  } catch {
    const lenient = decodeWith(new TextDecoder('utf-8'), bytes)

    return hasNonAsciiText(lenient.text) ? lenient : decodeWith(new TextDecoder('windows-1252'), bytes)
  }
}

/** Decodes, naming the encoding by its canonical WHATWG name (`utf-8`, `windows-1252`, `utf-16le`). */
function decodeWith (decoder: TextDecoder, bytes: Uint8Array): DecodedText {
  return { text: decoder.decode(bytes), encoding: decoder.encoding }
}

/**
 * The charset a content type declares (`text/csv; charset=ISO-8859-1`).
 *
 * @param contentType - The header value.
 * @returns The charset, or `undefined`.
 */
export function charsetOf (contentType: string): string | undefined {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType)

  return match?.[1]
}

function bomOf (bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf8'
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le'
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be'

  return undefined
}

/** Whether the text holds a character beyond ASCII other than the replacement character: valid UTF-8 was seen. */
function hasNonAsciiText (text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code !== 0xFF_FD && code > 0x7F) return true
  }

  return false
}

function decoderFor (label: string): TextDecoder | undefined {
  try {
    return new TextDecoder(label.trim())
  } catch {
    return undefined
  }
}
