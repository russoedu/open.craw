import type { SinkSummary } from '../record-sink'

/** What one input recipe did. */
export interface RecipeReport {
  recipeId:   string
  mode:       'web' | 'api'
  emitted:    number
  rejected:   number
  duplicates: number
  pages:      number
  durationMs: number
  /** Set when the recipe stopped on a failure. */
  error?:     string
}

/** What a whole run did. */
export interface CrawlReport {
  outputId:   string
  recipes:    RecipeReport[]
  /** Records written to the sink across every recipe. */
  records:    number
  sink:       SinkSummary
  durationMs: number
}
