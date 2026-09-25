import { isOn, namespacedAttribute, walkXml } from '../ooxml-package'
import type { Sheet } from '../spreadsheet'
import type { SlideShape } from './deck.model'
import { isBox, readGeometry } from './placeholder-geometry.mapper'
import type { Box, PlaceholderKey } from './placeholder-geometry.mapper'

/** What a slide part holds, before its charts and notes are read. */
export interface SlideContent {
  title?:   string
  hidden:   boolean
  shapes:   SlideShape[]
  tables:   Sheet<string>[]
  /** The relationship ids of its charts. */
  chartIds: string[]
}

const EMU_PER_POINT = 12_700
/** Placeholders that repeat on every slide and carry no content. */
const LAYOUT_NOISE = new Set(['sldNum', 'dt', 'ftr'])
const TITLES = new Set(['title', 'ctrTitle'])

interface Group {
  box:        Partial<Box>
  childBox:   Partial<Box>
  properties: boolean
}

interface OpenShape {
  placeholder?: PlaceholderKey
  box?:         Partial<Box>
  paragraphs:   string[]
}

interface OpenCell {
  paragraphs: string[]
  columnSpan: number
  rowSpan:    number
  continued:  boolean
}

interface OpenTable {
  rows:   string[][]
  merges: string[]
}

/**
 * Reads a slide part: its text boxes with their positions (group transforms
 * applied; a placeholder without a position of its own takes the one
 * `placeholderBox` gives), its tables with their merged cells, the ids of its
 * charts, its title and whether it is hidden.
 *
 * @param xml - The slide part.
 * @param placeholderBox - Where an unpositioned placeholder sits (from the layout and master).
 * @returns The content.
 */
export function readSlide (xml: string, placeholderBox: (key: PlaceholderKey) => Box | undefined): SlideContent {
  const content: SlideContent = { hidden: false, shapes: [], tables: [], chartIds: [] }
  const groups: Group[] = []
  let shape: OpenShape | undefined
  let table: OpenTable | undefined
  let row: string[] | undefined
  let cell: OpenCell | undefined
  let paragraph: string | undefined
  let inText = false
  let xfrm: Partial<Box> | undefined
  const finishShape = (open: OpenShape): void => {
    const text = open.paragraphs.join('\n').trim()
    const type = open.placeholder?.type
    if (text === '' || (type !== undefined && LAYOUT_NOISE.has(type))) return
    if (type !== undefined && TITLES.has(type)) content.title ??= text
    const own = isBox(open.box) ? transformed(open.box, groups) : undefined
    const box = own ?? (open.placeholder === undefined ? undefined : placeholderBox(open.placeholder)) ?? { x: 0, y: 0, width: 0, height: 0 }
    content.shapes.push({ ...points(box), text, ...(type !== undefined && { placeholder: type }) })
  }
  walkXml(xml, {
    open: (name, attributes) => {
      switch (name) {
        case 'sld': {
          content.hidden = attributes.show === '0' || attributes.show === 'false'

          break
        }
        case 'grpSp': {
          groups.push({ box: {}, childBox: {}, properties: false })

          break
        }
        case 'grpSpPr': {
          const group = groups.at(-1)
          if (group !== undefined) group.properties = true

          break
        }
        case 'sp':
        case 'graphicFrame': {
          shape = { paragraphs: [] }

          break
        }
        case 'ph': {
          if (shape !== undefined) shape.placeholder = { type: attributes.type ?? 'obj', idx: attributes.idx }

          break
        }
        case 'xfrm': {
          const group = groups.at(-1)
          if (group?.properties === true) xfrm = group.box
          else if (shape !== undefined && table === undefined) xfrm = shape.box = {}

          break
        }
        case 'chOff':
        case 'chExt': {
          const group = groups.at(-1)
          if (group?.properties === true) readGeometry(name === 'chOff' ? 'off' : 'ext', attributes, group.childBox)

          break
        }
        case 'off':
        case 'ext': {
          if (xfrm !== undefined) readGeometry(name, attributes, xfrm)

          break
        }
        case 'tbl': {
          table = { rows: [], merges: [] }

          break
        }
        case 'tr': {
          if (table !== undefined) row = []

          break
        }
        case 'tc': {
          if (row !== undefined) cell = { paragraphs: [], columnSpan: Number(attributes.gridSpan ?? 1), rowSpan: Number(attributes.rowSpan ?? 1), continued: isOn(attributes.hMerge) || isOn(attributes.vMerge) }

          break
        }
        case 'p': {
          paragraph = ''

          break
        }
        case 't': {
          inText = paragraph !== undefined

          break
        }
        case 'br': {
          if (paragraph !== undefined) paragraph += '\n'

          break
        }
        case 'chart': {
          const id = namespacedAttribute(attributes, 'id')
          if (id !== undefined) content.chartIds.push(id)

          break
        }
        // No default
      }
    },
    text: (text) => {
      if (inText && paragraph !== undefined) paragraph += text
    },
    close: (name) => {
      switch (name) {
        case 't': {
          inText = false

          break
        }
        case 'p': {
          if (paragraph !== undefined) (cell ?? shape)?.paragraphs.push(paragraph)
          paragraph = undefined

          break
        }
        case 'xfrm': {
          xfrm = undefined

          break
        }
        case 'grpSpPr': {
          const group = groups.at(-1)
          if (group !== undefined) group.properties = false

          break
        }
        case 'grpSp': {
          groups.pop()

          break
        }
        case 'tc': {
          if (cell !== undefined && row !== undefined && table !== undefined) {
            if (cell.columnSpan > 1 || cell.rowSpan > 1) table.merges.push(rangeOf(table.rows.length, row.length, cell.rowSpan, cell.columnSpan))
            row.push(cell.continued ? '' : cell.paragraphs.join('\n').trim())
          }
          cell = undefined

          break
        }
        case 'tr': {
          if (row !== undefined) table?.rows.push(row)
          row = undefined

          break
        }
        case 'tbl': {
          if (table !== undefined) content.tables.push({ name: `table ${content.tables.length + 1}`, hidden: false, rows: table.rows, hiddenRows: [], merges: table.merges })
          table = undefined

          break
        }
        case 'sp':
        case 'graphicFrame': {
          if (shape !== undefined) finishShape(shape)
          shape = undefined

          break
        }
        // No default
      }
    },
  })
  content.shapes.sort((first, second) => Math.round(first.y) - Math.round(second.y) || first.x - second.x)

  return content
}

/** A child's box in slide coordinates: each enclosing group maps its child space onto its own box, innermost first. */
function transformed (box: Box, groups: readonly Group[]): Box {
  let mapped = box
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const { box: outer, childBox: inner } = groups[index]
    if (!isBox(outer) || !isBox(inner) || inner.width === 0 || inner.height === 0) continue
    const scaleX = outer.width / inner.width
    const scaleY = outer.height / inner.height
    mapped = { x: outer.x + (mapped.x - inner.x) * scaleX, y: outer.y + (mapped.y - inner.y) * scaleY, width: mapped.width * scaleX, height: mapped.height * scaleY }
  }

  return mapped
}

function toPoints (emu: number): number {
  return Math.round((emu / EMU_PER_POINT) * 100) / 100
}

function points (box: Box): Box {
  const round = toPoints

  return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }
}

/** A merged range as an A1 reference (`A1:D1`). */
function rangeOf (row: number, column: number, rowSpan: number, columnSpan: number): string {
  return `${columnLetter(column)}${row + 1}:${columnLetter(column + columnSpan - 1)}${row + rowSpan}`
}

function columnLetter (index: number): string {
  let letters = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCodePoint(65 + ((rest - 1) % 26)) + letters

  return letters
}
