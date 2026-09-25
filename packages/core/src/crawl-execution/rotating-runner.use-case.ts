import type { AccessLease } from '../access'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope, LiveElement } from '../extraction-scope'
import type { InputRecipe, PaginateNext, Step } from '../recipe-schema'
import { BlockedError } from '../step-flow'
import type { NextPageResult, StepRunner } from '../step-flow'

/** A runner and the access lease it was opened with. */
export interface LeasedRunner {
  runner: StepRunner
  lease:  AccessLease
}

export interface RotatingRunnerOptions {
  recipe:       InputRecipe
  events:       EventBus
  /** How many rotations the run may use; 0 disables rotation. */
  maxRotations: number
  /** Opens a runner on a fresh lease: attempt 1 first, then 2, 3... */
  open:         (attempt: number) => Promise<LeasedRunner>
}

/**
 * The runner a recipe run uses. It delegates to a runner opened on an access
 * lease, reports every block as an `access:blocked` event and, when the recipe
 * allows it, rotates: takes a new lease, opens a new runner on it (re-running
 * the bootstrap) and tells the step walk to retry the blocked step.
 *
 * Under concurrency several iterations can be blocked by the same lease at
 * once. Each block remembers the generation of runner that produced it, so
 * only the first one rotates; the rest just retry on the new runner. Replaced
 * runners are kept until the run ends, because other iterations may still have
 * requests in flight on them.
 */
export class RotatingRunner implements StepRunner {
  /**
   * Opens the first runner.
   *
   * @param options - The recipe, events, rotation budget and how to open a runner.
   * @returns The rotating runner.
   */
  static async open (options: RotatingRunnerOptions): Promise<RotatingRunner> {
    return new RotatingRunner(await options.open(1), options)
  }

  private current:          LeasedRunner
  private readonly retired: LeasedRunner[] = []
  private readonly blockedAt = new WeakMap<BlockedError, number>()
  private generation = 0
  private rotations = 0
  private rotating:         Promise<void> | undefined

  private constructor (first: LeasedRunner, private readonly options: RotatingRunnerOptions) {
    this.current = first
  }

  private get inner (): StepRunner {
    return this.current.runner
  }

  private async swap (attempt: number): Promise<void> {
    const next = await this.options.open(attempt)
    this.retired.push(this.current)
    this.current = next
    this.generation += 1
  }

  private note (error: unknown, generation: number): void {
    if (!(error instanceof BlockedError)) return
    this.blockedAt.set(error, generation)
    this.options.events.emit({ type: 'access:blocked', recipeId: this.options.recipe.id, url: error.url, status: error.status, reason: error.reason })
  }

  async runLeaf (step: Step, scope: ExtractionScope): Promise<void> {
    const generation = this.generation
    try {
      await this.inner.runLeaf(step, scope)
    } catch (error) {
      this.note(error, generation)
      throw error
    }
  }

  async nextPage (next: PaginateNext, scope: ExtractionScope): Promise<NextPageResult> {
    const generation = this.generation
    try {
      return await this.inner.nextPage(next, scope)
    } catch (error) {
      this.note(error, generation)
      throw error
    }
  }

  async elements (selector: string, scope: ExtractionScope): Promise<LiveElement[]> {
    if (this.inner.elements === undefined) throw new Error('forEach over selector iterates live elements and needs a browser; this recipe runs in api mode')

    return this.inner.elements(selector, scope)
  }

  async rotate (error: BlockedError): Promise<boolean> {
    if (this.options.maxRotations === 0) return false
    if (this.rotating !== undefined) {
      await this.rotating

      return true
    }
    if ((this.blockedAt.get(error) ?? this.generation) < this.generation) return true
    if (this.rotations >= this.options.maxRotations) return false
    this.rotations += 1
    this.options.events.emit({ type: 'access:rotate', recipeId: this.options.recipe.id, attempt: this.rotations + 1, reason: error.message })
    this.rotating = this.swap(this.rotations + 1)
    try {
      await this.rotating
    } finally {
      this.rotating = undefined
    }

    return true
  }

  async dispose (): Promise<void> {
    const all = [...this.retired, this.current]
    await Promise.allSettled(all.map(({ runner }) => runner.dispose()))
    await Promise.allSettled(all.flatMap(({ lease }) => (lease.release === undefined ? [] : [lease.release()])))
  }
}
