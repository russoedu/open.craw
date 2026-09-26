/** Default solves a recipe run may spend. */
export const DEFAULT_MAX_SOLVES = 10

/**
 * The solves a recipe run may still spend. Every solve costs money: a detector
 * that matches the wrong element would drain a balance without it. Shared by
 * every runner of the run, rotations included.
 */
export class CaptchaBudget {
  private used = 0

  constructor (readonly max: number = DEFAULT_MAX_SOLVES) {}

  /** Solves spent so far. */
  get spent (): number {
    return this.used
  }

  /**
   * Spends one solve.
   *
   * @returns Whether one was left.
   */
  take (): boolean {
    if (this.used >= this.max) return false
    this.used += 1

    return true
  }
}
