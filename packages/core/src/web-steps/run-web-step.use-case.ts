import type { Page } from 'playwright'
import { BrowserSession } from '../browser-session'
import type { CaptchaGuard } from '../captcha'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope, LiveElement } from '../extraction-scope'
import type { GotoStep, InputRecipe, PaginateNext, Step } from '../recipe-schema'
import { BlockedError, RunGate } from '../step-flow'
import type { NextPageResult, StepRunner } from '../step-flow'
import { renderText } from '../template'
import { evaluateScript } from './evaluate-script.use-case'
import { extractFromPage } from './extract-from-page.use-case'
import { appears, click, fill, press, screenshot, scroll, select, wait } from './interact.use-case'
import { snapshotElements } from './snapshot-elements.use-case'
import { navigate } from './navigate.use-case'

const NEXT_LINK_TIMEOUT_MS = 2000
/** Steps after which a page may show a new captcha (`session.captcha`). */
const CHALLENGING_STEPS = new Set<string>(['click', 'press'])

/**
 * Runs web-mode leaf steps on a browser page. With a captcha guard, a page a
 * navigation, click or key press leads to is checked for a challenge, solved
 * before the next step runs.
 */
export class WebStepRunner implements StepRunner {
  private readonly page: Page

  constructor (
    private readonly session: BrowserSession,
    private readonly recipe: InputRecipe,
    private readonly events: EventBus,
    private readonly gate: RunGate = new RunGate(1, recipe.limits?.delayMs ?? 0),
    private readonly captcha?: CaptchaGuard,
  ) {
    this.page = session.page
  }

  /** Clicks and key presses can navigate; keep `page.url` honest after every leaf step. */
  private trackUrl (scope: ExtractionScope): void {
    const url = this.page.url()
    if (scope.pageState?.url !== url) scope.setPage({ url })
  }

  /** Navigates; a block page showing a captcha is solved under `onBlock.solve`, and a page reached is checked for one. */
  private async visit (step: GotoStep, scope: ExtractionScope): Promise<void> {
    try {
      await navigate(step, this.page, scope, this.recipe, this.gate, this.events)
    } catch (error) {
      if (!(error instanceof BlockedError) || this.captcha?.solvesBlocks !== true) throw error
      await this.captcha.solveBlock(this.page, error)

      return
    }
    await this.captcha?.check(this.page)
  }

  async runLeaf (step: Step, scope: ExtractionScope): Promise<void> {
    switch (step.type) {
      case 'goto': { await this.visit(step, scope); break
      }
      case 'captcha': {
        if (this.captcha === undefined) throw new Error('a captcha step needs a crawler with captcha solvers')
        await this.captcha.step(this.page, step)
        break
      }
      case 'click': { await click(step, this.page, scope); break
      }
      case 'fill': { await fill(step, this.page, scope); break
      }
      case 'press': { await press(step, this.page, scope); break
      }
      case 'select': { await select(step, this.page, scope); break
      }
      case 'scroll': { await scroll(step, this.page); break
      }
      case 'wait': { await wait(step, this.page); break
      }
      case 'screenshot': { await screenshot(step, this.page, scope); break
      }
      case 'evaluate': { await evaluateScript(step, this.page, scope); break
      }
      case 'extract': { await extractFromPage(step, this.page, scope); break
      }
      default: { throw new Error(`"${step.type}" is an api step; this recipe runs in web mode`)
      }
    }
    if (CHALLENGING_STEPS.has(step.type)) await this.captcha?.check(this.page)
    this.trackUrl(scope)
  }

  async nextPage (next: PaginateNext, scope: ExtractionScope): Promise<NextPageResult> {
    if ('jsonpath' in next) throw new Error('next.jsonpath reads an api document; use next.selector or next.url in web mode')
    if ('url' in next) {
      const target = renderText(next.url, path => scope.lookup(path))
      if (target === '') return null
      await this.visit({ type: 'goto', url: target }, scope)

      return { kind: 'url', url: this.page.url() }
    }
    // The page body may have navigated away (a forEach visiting every item);
    // pagination continues from the listing page the body started on.
    const listing = scope.pageState?.url
    if (listing !== undefined && listing !== '' && this.page.url() !== listing) await this.page.goto(listing)
    const link = this.page.locator(next.selector).first()
    if (!await appears(link, NEXT_LINK_TIMEOUT_MS)) return null
    const before = this.page.url()
    const release = await this.gate.request(before)
    try {
      await link.click()
      await this.page.waitForLoadState()
    } finally {
      release()
    }
    if (this.page.url() === before) await this.page.waitForTimeout(NEXT_LINK_TIMEOUT_MS / 4)
    this.events.emit({ type: 'page:visit', recipeId: this.recipe.id, url: this.page.url(), number: (scope.pageState?.number ?? 1) + 1 })
    await this.captcha?.check(this.page)

    return { kind: 'url', url: this.page.url() }
  }

  /**
   * A runner on a new tab of the same context, for one parallel iteration:
   * it shares cookies, the gate and the captcha guard; disposing it closes the tab only.
   *
   * @returns The forked runner.
   */
  async fork (): Promise<WebStepRunner> {
    const { context } = this.session
    const page = await context.newPage()
    const viewport = this.recipe.session?.viewport
    if (viewport !== undefined) await page.setViewportSize(viewport)

    return new WebStepRunner(new BrowserSession(context, page, async () => { await page.close() }), this.recipe, this.events, this.gate, this.captcha)
  }

  async elements (selector: string): Promise<LiveElement[]> {
    return snapshotElements(selector, this.page)
  }

  async dispose (): Promise<void> {
    await this.session.close()
  }
}
