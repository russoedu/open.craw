import { walkXml } from '../ooxml-package'
import type { ValueMode } from '../spreadsheet'
import type { SlideChart } from './deck.model'

interface OpenSeries {
  name:       string[]
  categories: string[]
  values:     string[]
}

type Target = 'name' | 'categories' | 'values'

/**
 * Reads a chart part: its type, title and series, from the values the chart
 * caches next to its formulas (`c:strCache`, `c:numCache`), so the embedded
 * workbook is never needed.
 *
 * @param xml - The chart part.
 * @param mode - `typed`: values as numbers (`null` where missing); `text`: as text.
 * @returns The chart.
 */
export function readChart (xml: string, mode: ValueMode): SlideChart<number | null | string> {
  let type = ''
  let title: string | undefined
  const series: OpenSeries[] = []
  let current: OpenSeries | undefined
  let target: Target | undefined
  let point = 0
  let capturing = false
  let inPlotArea = false
  let titleText: string | undefined
  walkXml(xml, {
    open: (name, attributes) => {
      if (name === 'plotArea') {
        inPlotArea = true
      } else if (!inPlotArea && name === 'title' && title === undefined) {
        titleText = ''
      } else if (inPlotArea && type === '' && name.endsWith('Chart')) {
        type = name.slice(0, -'Chart'.length)
      } else if (name === 'ser') {
        current = { name: [], categories: [], values: [] }
      } else if (current !== undefined) {
        const next = targetOf(name)
        if (next !== undefined) {
          target = next
          point = 0
        } else if (name === 'ptCount' && target !== undefined) {
          // Points left out of the cache are missing values: keep their places.
          current[target].length = Math.max(current[target].length, Number(attributes.val ?? 0))
        } else if (name === 'pt') {
          point = Number(attributes.idx ?? 0)
        } else if (name === 'v') {
          capturing = true
          if (target !== undefined) current[target][point] = ''
        }
      }
    },
    text: (text) => {
      if (titleText !== undefined) titleText += text
      else if (capturing && current !== undefined && target !== undefined) current[target][point] += text
    },
    close: (name) => {
      if (name === 'v') {
        capturing = false
      } else if (name === 'title' && titleText !== undefined) {
        title = titleText.trim()
        titleText = undefined
      } else if (name === 'ser' && current !== undefined) {
        series.push(current)
        current = undefined
      } else if (targetOf(name) !== undefined) {
        target = undefined
      }
    },
  })

  return {
    type,
    ...(!(title === undefined || title === '') && { title }),
    series: series.map(open => ({ name: open.name.join('').trim(), categories: Array.from(open.categories, text => text ?? ''), values: Array.from(open.values, text => valueOf(text, mode)) })),
  }
}

/** Where a series element's cached points go: its name, its categories (x values of a scatter), its values. */
function targetOf (name: string): Target | undefined {
  if (name === 'tx') return 'name'
  if (name === 'cat' || name === 'xVal') return 'categories'

  return name === 'val' || name === 'yVal' ? 'values' : undefined
}

function valueOf (text: string | undefined, mode: ValueMode): number | null | string {
  const number = text === undefined || text.trim() === '' ? NaN : Number(text)
  if (mode === 'text') return Number.isNaN(number) ? (text ?? '') : String(number)

  return Number.isNaN(number) ? null : number
}
