import type { CaptchaSolver } from './captcha-solver.contract'
import { manualCaptchaSolver } from './manual-captcha-solver.use-case'

/** Solvers every crawler has; a solver given with the same name replaces one. */
const BUILT_IN: readonly CaptchaSolver[] = [manualCaptchaSolver]

/** The captcha solvers a crawler was given, by name, and the built-in ones (`manual`). */
export class CaptchaSolverRegistry {
  private readonly solvers = new Map<string, CaptchaSolver>()
  private readonly order: string[] = []

  constructor (solvers: readonly CaptchaSolver[] = []) {
    for (const solver of solvers) {
      if (this.solvers.has(solver.name)) throw new Error(`two captcha solvers are named "${solver.name}"`)
      this.solvers.set(solver.name, solver)
      this.order.push(solver.name)
    }
  }

  /** The registered names. */
  get names (): string[] {
    return [...this.order]
  }

  has (name: string): boolean {
    return this.solvers.has(name) || BUILT_IN.some(builtIn => builtIn.name === name)
  }

  /**
   * The solver of that name.
   *
   * @param name - As a recipe names it.
   * @returns The solver.
   * @throws Error naming what is registered when it is not.
   */
  resolve (name: string): CaptchaSolver {
    const solver = this.solvers.get(name) ?? BUILT_IN.find(builtIn => builtIn.name === name)
    if (solver === undefined) throw new Error(`captcha solver "${name}" is not registered (registered: ${this.names.join(', ') || 'none'}); built-in solvers: ${BUILT_IN.map(builtIn => builtIn.name).join(', ')}; give it to createCrawler({ captchaSolvers }) or export it from the plugins module`)

    return solver
  }

  /**
   * Lets every registered solver release what it holds (a worker, a
   * connection). A solver that fails to close is skipped.
   *
   * @returns The failures, as messages.
   */
  async close (): Promise<string[]> {
    const failures: string[] = []
    for (const solver of this.solvers.values()) {
      try {
        await solver.close?.()
      } catch (error) {
        failures.push(`captcha solver "${solver.name}" did not close: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return failures
  }
}
