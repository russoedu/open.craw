/** The delimiters detection chooses between, in order of preference on a tie. */
export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const

/** How much of a file delimiter detection looks at. */
const SAMPLE_CHARS = 64 * 1024
/** How many lines of the sample delimiter detection scores. */
const SAMPLE_LINES = 100

/**
 * Parses CSV text (RFC 4180, tolerant): a field in double quotes may hold the
 * delimiter, line breaks and `""` for a quote; a quote inside an unquoted
 * field is taken literally (`1.0 Hybrid "Cross"`); CRLF, LF and CR all end a
 * record. Rows are kept as read: ragged rows stay ragged, nothing is trimmed.
 *
 * @param text - The decoded file.
 * @param delimiter - One character.
 * @returns The rows; a trailing empty line adds no row.
 */
export function parseCsv (text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '"' && field === '') {
      const quoted = readQuoted(text, index + 1)
      field = quoted.value
      index = quoted.next
    } else if (char === delimiter) {
      row.push(field)
      field = ''
      index += 1
    } else if (char === '\n' || char === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1
    } else {
      const end = plainEnd(text, index + 1, delimiter)
      field += text.slice(index, end)
      index = end
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Chooses the delimiter of a CSV: the candidate whose field count (above one)
 * is the most consistent over the first lines, so a title line or two above
 * the header does not mislead it. A file of one column gets `,`.
 *
 * `;` with decimal commas (`Panda;15.950,00`), the usual European export,
 * scores `;`: a comma split gives rows of uneven width.
 *
 * @param text - The decoded file.
 * @returns The delimiter.
 */
export function detectDelimiter (text: string): string {
  const sample = text.slice(0, SAMPLE_CHARS)
  const truncated = text.length > SAMPLE_CHARS
  let best = { delimiter: ',', score: 0 }
  for (const delimiter of CSV_DELIMITERS) {
    const rows = parseCsv(sample, delimiter).slice(0, SAMPLE_LINES).filter(row => row.length > 1 || row[0] !== '')
    // The sample may cut the last line short.
    if (truncated && rows.length > 1) rows.pop()
    const score = consistency(rows)
    if (score > best.score) best = { delimiter, score }
  }

  return best.delimiter
}

/** The share of rows with the most common width above one, with that width breaking ties; 0 when no row splits. */
function consistency (rows: readonly string[][]): number {
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(row.length, (counts.get(row.length) ?? 0) + 1)
  let width = 1
  let agreeing = 0
  for (const [length, count] of counts) {
    if (!(length > 1 && (count > agreeing || (count === agreeing && length > width)))) {
      continue
    }

    width = length
    agreeing = count
  }

  return width > 1 ? (agreeing / rows.length) * 1000 + width : 0
}

/** Reads a quoted field starting after its opening quote. */
function readQuoted (text: string, start: number): { value: string, next: number } {
  let value = ''
  let index = start
  for (;;) {
    const quote = text.indexOf('"', index)
    if (quote === -1) return { value: value + text.slice(index), next: text.length }
    value += text.slice(index, quote)
    if (text[quote + 1] !== '"') return { value, next: quote + 1 }
    value += '"'
    index = quote + 2
  }
}

/** Where a run of plain characters (no delimiter, no line break) ends. */
function plainEnd (text: string, start: number, delimiter: string): number {
  const stops = new Set([delimiter, '\n', '\r'])
  let index = start
  while (index < text.length) {
    if (stops.has(text[index])) break
    index += 1
  }

  return index
}
