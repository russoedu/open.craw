import type { ExtractionScope, LiveElement } from '../extraction-scope'
import type { PaginateNext, Step } from '../recipe-schema'
import type { BlockedError } from './blocked.error'

/**
 * Disposes a runner, ignoring a failure: a tab whose browser already went
 * away (a rotation, a crash) has nothing left to close.
 *
 * @param runner - The runner.
 */
export async function disposeQuietly (runner: StepRunner): Promise<void> {
  try {
    await runner.dispose()
  } catch {
    // already gone
  }
}

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
  /**
   * Called when a step is blocked. `true` means the runner now reaches the
   * network another way (a new access lease) and the step should run again;
   * `false` means it cannot, and the block fails the step like any error.
   */
  rotate?:   (error: BlockedError) => Promise<boolean>
  /**
   * A runner of its own for one parallel `forEach` iteration: a new tab in the
   * same browser context (same cookies, its own page), disposed when the
   * iteration ends. Web mode; an api runner is shared as it is.
   */
  fork?:     () => Promise<StepRunner>
  dispose:   () => Promise<void>
}
