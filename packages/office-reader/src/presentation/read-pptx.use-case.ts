import { namespacedAttribute, OoxmlPackage, relationshipOfType, relationshipsOf, walkXml } from '../ooxml-package'
import type { PackageLimits } from '../ooxml-package'
import { OfficeReadError } from '../read-error'
import { readSource } from '../source-bytes'
import type { OfficeSource } from '../source-bytes'
import type { ValueMode } from '../spreadsheet'
import { readChart } from './chart.mapper'
import type { Deck, Slide, SlideChart, SlideFilter } from './deck.model'
import { readNotes } from './notes.mapper'
import { inheritedBox, placeholderBoxes } from './placeholder-geometry.mapper'
import type { PlaceholderBoxes } from './placeholder-geometry.mapper'
import { readSlide } from './slide.mapper'

/** How to read a presentation. */
export interface ReadPptxOptions {
  /** Which slides to read; default all. */
  slides?: SlideFilter
  /** `typed` (default): chart values as numbers; `text`: as text. */
  values?: ValueMode
  /** Read speaker notes; default true. */
  notes?:  boolean
  /** Read charts; default true. */
  charts?: boolean
  /** How much the file may inflate to. */
  limits?: PackageLimits
}

const POINTS = 12_700
/** 10 × 7.5 inches, PowerPoint's default before 16:9. */
const DEFAULT_SIZE = { width: 9_144_000, height: 6_858_000 }

/**
 * Reads a `.pptx` presentation (also `.pptm`, `.ppsx`): every slide's text
 * boxes with their positions, its tables, its charts' data and its notes.
 * Slides come in presentation order, not file order.
 *
 * @param source - A path, bytes, a Blob or a stream (see {@link OfficeSource}).
 * @param options - Which slides, which value mode, what to leave out, which limits.
 * @returns The deck.
 * @throws OfficeReadError for a file that is not a readable presentation: `legacy-format` (`.ppt`), `encrypted`, `unsupported-format` (`.odp`), `not-pptx`, `too-large`…
 */
export async function readPptx (source: OfficeSource, options: ReadPptxOptions & { values: 'text' }): Promise<Deck<string>>
export async function readPptx (source: OfficeSource, options?: ReadPptxOptions): Promise<Deck>
export async function readPptx (source: OfficeSource, options: ReadPptxOptions = {}): Promise<Deck<number | null | string>> {
  const pkg = OoxmlPackage.open(await readSource(source), options.limits)
  const main = relationshipOfType(relationshipsOf(pkg, ''), 'officeDocument')?.target ?? (pkg.has('ppt/presentation.xml') ? 'ppt/presentation.xml' : '')
  const ids: string[] = []
  const size = { ...DEFAULT_SIZE }
  let isPresentation = false
  walkXml(pkg.text(main), {
    open: (name, attributes) => {
      switch (name) {
        case 'presentation': {
          isPresentation = true
          break
        }
        case 'sldId': {
          ids.push(namespacedAttribute(attributes, 'id') ?? '')
          break
        }
        case 'sldSz': { {
          Object.assign(size, { width: Number(attributes.cx ?? DEFAULT_SIZE.width), height: Number(attributes.cy ?? DEFAULT_SIZE.height) })
          // No default
        }
        break
        }
      }
    },
  })
  if (!isPresentation) throw new OfficeReadError('not-pptx', `not a presentation: the package's main part is ${main === '' ? 'missing' : main}${main.endsWith('workbook.xml') ? ' (a spreadsheet: read it with readXlsx)' : ''}`)
  const relationships = relationshipsOf(pkg, main)
  const layouts = new Map<string, { layout: PlaceholderBoxes, master: PlaceholderBoxes }>()
  const mode = options.values ?? 'typed'
  const selected = selector(options.slides)
  const slides: Slide<number | null | string>[] = []
  for (const [index, id] of ids.entries()) {
    const part = relationships.get(id)
    if (part?.type !== 'slide') continue
    const slideRelationships = relationshipsOf(pkg, part.target)
    const layoutPart = relationshipOfType(slideRelationships, 'slideLayout')?.target
    const geometry = layoutPart === undefined ? undefined : geometryOf(pkg, layoutPart, layouts)
    const content = readSlide(pkg.text(part.target), key => (geometry === undefined ? undefined : inheritedBox(key, geometry.layout, geometry.master)))
    const number = index + 1
    if (!selected({ number, title: content.title ?? '', hidden: content.hidden })) continue
    const charts: SlideChart<number | null | string>[] = options.charts === false
      ? []
      : content.chartIds.flatMap((chartId) => {
          const chart = slideRelationships.get(chartId)

          return chart === undefined ? [] : [readChart(pkg.text(chart.target), mode)]
        })
    const notesPart = options.notes === false ? undefined : relationshipOfType(slideRelationships, 'notesSlide')?.target
    slides.push({
      number,
      ...(content.title !== undefined && { title: content.title }),
      hidden: content.hidden,
      shapes: content.shapes,
      tables: content.tables,
      charts,
      notes:  notesPart === undefined ? '' : readNotes(pkg.text(notesPart)),
    })
  }

  return { width: Math.round((size.width / POINTS) * 100) / 100, height: Math.round((size.height / POINTS) * 100) / 100, slides }
}

/** A layout's and its master's placeholder boxes, read once per layout. */
function geometryOf (pkg: OoxmlPackage, layoutPart: string, cache: Map<string, { layout: PlaceholderBoxes, master: PlaceholderBoxes }>): { layout: PlaceholderBoxes, master: PlaceholderBoxes } {
  const cached = cache.get(layoutPart)
  if (cached !== undefined) return cached
  const masterPart = relationshipOfType(relationshipsOf(pkg, layoutPart), 'slideMaster')?.target
  const geometry = { layout: placeholderBoxes(pkg.text(layoutPart)), master: placeholderBoxes(masterPart === undefined ? '' : pkg.text(masterPart)) }
  cache.set(layoutPart, geometry)

  return geometry
}

function selector (filter: SlideFilter | undefined): (slide: { number: number, title: string, hidden: boolean }) => boolean {
  if (filter === undefined) return () => true
  if (Array.isArray(filter)) return slide => filter.includes(slide.number)
  if (filter instanceof RegExp) return slide => filter.test(slide.title)

  return filter
}
