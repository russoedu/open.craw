import type { ExtractionScope, LiveElement } from '../extraction-scope'
import type { PaginateNext, Step } from '../recipe-schema'

/** What `paginate` learns from the runner after a page body ran. */
export type NextPageResult =
  /** The next page is at this URL (the runner already navigated in web mode). */
  | { kind: 'url', url: string } |
  /** A value to bind in the next page's scope under `name` (a cursor, a token). */
  { kind: 'value', name: string, value: unknown } |
  /** There is no next page. */
  null

/**
 * The mode-specific half of step execution. `step-flow` walks the tree and
 * owns control flow; a runner executes leaf steps against a page or a request
 * context. Runners never mutate scope bindings other than through this contract.
 */
export interface StepRunner {
  /** Runs one leaf step (not forEach, paginate, emit, set or hook). */
  runLeaf:   (step: Step, scope: ExtractionScope) => Promise<void>
  /** Finds (and in web mode reaches) the next page. */
  nextPage:  (next: PaginateNext, scope: ExtractionScope) => Promise<NextPageResult>
  /** Snapshots every element matching a rendered selector, for `forEach` over `selector`. Web mode only. */
  elements?: (selector: string, scope: ExtractionScope) => Promise<LiveElement[]>
  dispose:   () => Promise<void>
}
