import type { DeckDocument } from '@opencraw/core'
import { describeWorkbook } from './workbook-findings.mapper'

/** Short text boxes on one slide from which a probe suggests reading them as a table. */
const GRID_BOXES = 6
const SHORT_TEXT = 40

/** What a probe shows of a deck (a presentation). */
export interface DeckFindings {
  width:   number
  height:  number
  slides:  { number: number, title: string, hidden: boolean, shapes: number, tables: number, charts: number }[]
  /** The likely header rows of native tables, with the `slide` and `selector` a `table` extract needs. */
  headers: { slide: number, text: string, selector: string, hint?: string }[]
  charts:  { slide: number, type: string, title?: string, series: { name: string, points: number }[] }[]
  /** Slides whose short text boxes look like a table: read them with `"shapes": true`. */
  grids:   { slide: number, title: string, boxes: number }[]
}

/**
 * Summarises a deck for someone writing a recipe: its slides, where the native
 * tables start, what the charts hold, and which slides lay text boxes out as
 * a table.
 *
 * @param document - The read deck.
 * @returns The findings.
 */
export function describeDeck (document: DeckDocument): DeckFindings {
  return {
    width:   document.width,
    height:  document.height,
    slides:  document.slides.map(slide => ({ number: slide.number, title: slide.title ?? '', hidden: slide.hidden, shapes: slide.shapes.length, tables: slide.tables.length, charts: slide.charts.length })),
    headers: document.slides.flatMap(slide => describeWorkbook({ kind: 'workbook', sheets: slide.tables }).headers.map(({ sheet: _sheet, row: _row, ...header }) => ({ slide: slide.number, ...header }))),
    charts:  document.slides.flatMap(slide => slide.charts.map(chart => ({ slide: slide.number, type: chart.type, ...(chart.title !== undefined && { title: chart.title }), series: chart.series.map(series => ({ name: series.name, points: series.values.length })) }))),
    grids:   document.slides.flatMap((slide) => {
      const boxes = slide.shapes.filter(shape => shape.placeholder === undefined && shape.text.length <= SHORT_TEXT).length

      return boxes >= GRID_BOXES ? [{ slide: slide.number, title: slide.title ?? '', boxes }] : []
    }),
  }
}
