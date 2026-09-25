import { walkXml } from '../ooxml-package'
import type { NumberFormatKind } from './cell-value.algorithm'

/** Built-in number formats that show a date (14–17, 22 and the East Asian ones) or a time of day (18–21, 45–47). */
const BUILT_IN_DATES = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58])
const BUILT_IN_TIMES = new Set([18, 19, 20, 21, 32, 33, 45, 46, 47, 55, 56])

/**
 * What each cell style (`s`, an index into `cellXfs`) makes of a number, from
 * `styles.xml`: only dates and times need telling apart from numbers.
 *
 * @param stylesXml - The styles part; empty when the workbook has none.
 * @returns The kind per style index.
 */
export function formatKinds (stylesXml: string): NumberFormatKind[] {
  const codes = new Map<number, string>()
  const kinds: NumberFormatKind[] = []
  let inCellXfs = false
  walkXml(stylesXml, {
    open: (name, attributes) => {
      if (name === 'numFmt') codes.set(Number(attributes.numFmtId), attributes.formatCode ?? '')
      else if (name === 'cellXfs') inCellXfs = true
      else if (name === 'xf' && inCellXfs) kinds.push(kindOf(Number(attributes.numFmtId ?? 0), codes))
    },
    close: (name) => {
      if (name === 'cellXfs') inCellXfs = false
    },
  })

  return kinds
}

/**
 * What a format code shows: a date when it has a day, month or year, a time
 * of day when it has only hours, minutes or seconds. Quoted text, escaped
 * characters, colours and locales (`[Red]`, `[$-409]`) are ignored; an
 * elapsed time (`[h]:mm`) is a duration, so a number.
 */
function kindOf (id: number, codes: ReadonlyMap<number, string>): NumberFormatKind {
  const code = codes.get(id)
  if (code === undefined) {
    if (BUILT_IN_DATES.has(id)) return 'date'

    return BUILT_IN_TIMES.has(id) ? 'time' : 'number'
  }
  const firstSection = code.split(';', 1)[0]
  if (/\[(?:h+|m+|s+)\]/i.test(firstSection)) return 'number'
  const bare = firstSection.replaceAll(/"[^"]*"|\\.|\[[^\]]*\]/g, '').replaceAll(/am\/pm|a\/p/gi, '')
  if (/[dy]/i.test(bare) || hasMonth(bare)) return 'date'

  return /[hs]/i.test(bare) ? 'time' : 'number'
}

/** Whether a run of `m` is a month: minutes sit after an hour or before seconds (`h:mm`, `mm:ss`). */
function hasMonth (code: string): boolean {
  for (const run of code.matchAll(/m+/gi)) {
    const before = code.slice(0, run.index).trimEnd().at(-1)?.toLowerCase()
    const after = code.slice(run.index + run[0].length).trimStart()[0]?.toLowerCase()
    const minutes = before === 'h' || before === ':' || after === ':' || after === 's'
    if (!minutes) return true
  }

  return false
}
