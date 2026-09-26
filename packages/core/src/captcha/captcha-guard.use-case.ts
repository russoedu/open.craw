import type { Page } from 'playwright'
import type { AccessLease } from '../access'
import type { EventBus } from '../crawl-events'
import type { CaptchaCheck, CaptchaStep, InputRecipe } from '../recipe-schema'
import type { BlockedError } from '../step-flow'
import type { CaptchaBudget } from './captcha-budget.model'
import { DEFAULT_CAPTCHA_SELECTOR, detectChallenge } from './captcha-detection.client'
import type { CaptchaSolverRegistry } from './captcha-solver-registry.store'
import type { CaptchaChallenge } from './captcha-solver.contract'
import { DEFAULT_CAPTCHA_ATTEMPTS, DEFAULT_CAPTCHA_TIMEOUT_MS, resolveCaptcha } from './resolve-captcha.use-case'

export interface CaptchaGuardOptions {
  recipe:  InputRecipe
  events:  EventBus
  solvers: CaptchaSolverRegistry
  /** Shared by every runner of the recipe run, rotations and the bootstrap included. */
  budget:  CaptchaBudget
  /** The access the page goes through, handed to solvers. */
  lease?:  AccessLease
}

interface Resolved {
  solver:    string
  selector:  string
  verify?:   CaptchaCheck
  attempts:  number
  timeoutMs: number
}

/**
 * Where a web runner meets captchas: after each navigation, click and key
 * press (`session.captcha`), on a block page (`onBlock.solve`), and at a
 * `captcha` step.
 */
export class CaptchaGuard {
  constructor (private readonly options: CaptchaGuardOptions) {}

  private settings (): Resolved | undefined {
    const captcha = this.options.recipe.session?.captcha
    if (captcha === undefined) return undefined

    return {
      solver:    captcha.solver,
      selector:  captcha.detect?.selector ?? DEFAULT_CAPTCHA_SELECTOR,
      verify:    captcha.verify,
      attempts:  captcha.attempts ?? DEFAULT_CAPTCHA_ATTEMPTS,
      timeoutMs: captcha.timeoutMs ?? DEFAULT_CAPTCHA_TIMEOUT_MS,
    }
  }

  private async solve (page: Page, challenge: CaptchaChallenge, settings: Resolved): Promise<void> {
    const { recipe, events, solvers, budget, lease } = this.options
    events.emit({ type: 'captcha:detected', recipeId: recipe.id, url: challenge.url, kind: challenge.kind, siteKey: challenge.siteKey })
    await resolveCaptcha({ recipeId: recipe.id, page, challenge, solver: solvers.resolve(settings.solver), selector: settings.selector, verify: settings.verify, attempts: settings.attempts, timeoutMs: settings.timeoutMs, budget, events, lease })
  }

  /** Whether a block page is searched for a challenge before the block counts. */
  get solvesBlocks (): boolean {
    const session = this.options.recipe.session

    return session?.onBlock?.solve === true && session.captcha !== undefined
  }

  /**
   * The automatic check: with `session.captcha`, solves the challenge the page
   * shows, if any. Without it, nothing is looked for.
   *
   * @param page - The live page.
   * @throws CaptchaError when the challenge could not be solved.
   */
  async check (page: Page): Promise<void> {
    const settings = this.settings()
    if (settings === undefined) return
    const challenge = await detectChallenge(page, settings.selector)
    if (challenge !== undefined) await this.solve(page, challenge, settings)
  }

  /**
   * A block page under `onBlock.solve`: solves the challenge it shows. A block
   * without a challenge stays a block.
   *
   * @param page - The page showing the block.
   * @param blocked - The block.
   * @throws BlockedError (`blocked`) when the page shows no challenge; CaptchaError when it could not be solved.
   */
  async solveBlock (page: Page, blocked: BlockedError): Promise<void> {
    const settings = this.settings()
    if (settings === undefined) throw blocked
    const challenge = await detectChallenge(page, settings.selector)
    if (challenge === undefined) throw blocked
    await this.solve(page, challenge, settings)
  }

  /**
   * A `captcha` step: solves the challenge the page shows, reCAPTCHA v3
   * included; a page without one is fine.
   *
   * @param page - The live page.
   * @param step - The step.
   * @throws CaptchaError when the challenge could not be solved.
   */
  async step (page: Page, step: CaptchaStep): Promise<void> {
    const base = this.settings()
    const solver = step.solver ?? base?.solver
    if (solver === undefined) throw new Error('a captcha step needs a solver: name one ("solver") or add session.captcha')
    const settings: Resolved = {
      solver,
      selector:  step.selector ?? base?.selector ?? DEFAULT_CAPTCHA_SELECTOR,
      verify:    step.verify ?? base?.verify,
      attempts:  step.attempts ?? base?.attempts ?? DEFAULT_CAPTCHA_ATTEMPTS,
      timeoutMs: step.timeoutMs ?? base?.timeoutMs ?? DEFAULT_CAPTCHA_TIMEOUT_MS,
    }
    const challenge = await detectChallenge(page, settings.selector, { v3: true })
    if (challenge !== undefined) await this.solve(page, challenge, settings)
  }
}

/**
 * Every solver name a recipe uses (`session.captcha` and its `captcha`
 * steps, the bootstrap's included), to check them before the run starts.
 *
 * @param recipe - The input recipe.
 * @returns The names, without repeats.
 */
export function captchaSolverNames (recipe: InputRecipe): string[] {
  const names = new Set<string>()
  const fallback = recipe.session?.captcha?.solver
  if (fallback !== undefined) names.add(fallback)
  const visit = (steps: readonly InputRecipe['steps'][number][]): void => {
    for (const step of steps) {
      if (step.type === 'captcha') names.add(step.solver ?? fallback ?? '')
      if ('steps' in step) visit(step.steps)
      if (step.type === 'if') visit(step.else ?? [])
    }
  }
  visit(recipe.steps)
  visit(recipe.session?.bootstrap?.steps ?? [])
  names.delete('')

  return [...names]
}
