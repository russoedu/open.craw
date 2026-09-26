import type { SinkSummary } from '../record-sink'

/** What one input recipe did. */
export interface RecipeReport {
  recipeId:     string
  mode:         'web' | 'api'
  emitted:      number
  rejected:     number
  duplicates:   number
  /** Records a resumed run found in the sink already. */
  skipped:      number
  /** Steps whose `onError: skip` policy swallowed a failure: a check that found nothing, a value a page lacked. */
  stepsSkipped: number
  pages:        number
  durationMs:   number
  /** Captcha challenges met, solved, and solve attempts that failed; present when any was met. */
  captchas?:    { detected: number, solved: number, failed: number }
  /** Set when the recipe stopped on a failure. */
  error?:       string
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
