import type { Sheet } from '../spreadsheet'

/** A text box on a slide, in points from the slide's top-left corner. */
export interface SlideShape {
  x:            number
  y:            number
  width:        number
  height:       number
  /** Its paragraphs joined by line breaks. */
  text:         string
  /** The placeholder it fills (`title`, `body`, `subTitle`…), when it fills one. */
  placeholder?: string
}

/** One series of a chart, from the values the chart keeps with it (its cache). */
export interface ChartSeries<Value = number | null> {
  name:       string
  categories: string[]
  /** One per category; `typed`: numbers, `null` where a point is missing; `text`: shortest round-trip text, `''` where missing. */
  values:     Value[]
}

/** A chart on a slide. */
export interface SlideChart<Value = number | null> {
  /** `bar`, `line`, `pie`, `area`, `scatter`, `doughnut`… (the chart element's name without `Chart`). */
  type:   string
  title?: string
  series: ChartSeries<Value>[]
}

/** One slide. */
export interface Slide<Value = number | null> {
  /** Its position in the presentation, from 1. */
  number: number
  /** The text of its title placeholder. */
  title?: string
  /** Hidden in a slideshow. */
  hidden: boolean
  /** Its text boxes in reading order (top to bottom, left to right); slide numbers, dates and footers left out. */
  shapes: SlideShape[]
  /** Its tables, as sheets: `name` is `table 1`, `table 2`…; merged cells in `merges`. */
  tables: Sheet<string>[]
  charts: SlideChart<Value>[]
  /** The speaker notes. */
  notes:  string
}

/** A presentation read into slides. */
export interface Deck<Value = number | null> {
  /** The slide size, in points. */
  width:  number
  height: number
  slides: Slide<Value>[]
}

/** Which slides to read: numbers (from 1), a pattern on titles, or a test. */
export type SlideFilter = number[] | RegExp | ((slide: { number: number, title: string, hidden: boolean }) => boolean)
