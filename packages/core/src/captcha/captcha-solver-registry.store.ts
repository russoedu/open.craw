import type { CaptchaSolver } from './captcha-solver.contract'

/** The captcha solvers a crawler was given, by name. */
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
    return this.solvers.has(name)
  }

  /**
   * The solver of that name.
   *
   * @param name - As a recipe names it.
   * @returns The solver.
   * @throws Error naming what is registered when it is not.
   */
  resolve (name: string): CaptchaSolver {
    const solver = this.solvers.get(name)
    if (solver === undefined) throw new Error(`captcha solver "${name}" is not registered (registered: ${this.names.join(', ') || 'none'}); give it to createCrawler({ captchaSolvers }) or export it from the plugins module`)

    return solver
  }
}
