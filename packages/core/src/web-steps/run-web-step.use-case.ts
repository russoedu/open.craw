import type { Page } from 'playwright'
import type { BrowserSession } from '../browser-session'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope, LiveElement } from '../extraction-scope'
import type { InputRecipe, PaginateNext, Step } from '../recipe-schema'
import type { NextPageResult, StepRunner } from '../step-flow'
import { renderText } from '../template'
import { evaluateScript } from './evaluate-script.use-case'
import { extractFromPage } from './extract-from-page.use-case'
import { appears, click, fill, press, screenshot, scroll, select, wait } from './interact.use-case'
import { snapshotElements } from './snapshot-elements.use-case'
import { navigate } from './navigate.use-case'

const NEXT_LINK_TIMEOUT_MS = 2000

/** Runs web-mode leaf steps on a browser page. */
export class WebStepRunner implements StepRunner {
  private readonly page: Page

  constructor (
    private readonly session: BrowserSession,
    private readonly recipe: InputRecipe,
    private readonly events: EventBus,
  ) {
    this.page = session.page
  }

  /** Clicks and key presses can navigate; keep `page.url` honest after every leaf step. */
  private trackUrl (scope: ExtractionScope): void {
    const url = this.page.url()
    if (scope.pageState?.url !== url) scope.setPage({ url })
  }

  async runLeaf (step: Step, scope: ExtractionScope): Promise<void> {
    const limits = this.recipe.limits ?? {}
    switch (step.type) {
      case 'goto': { return navigate(step, this.page, scope, limits, this.events, this.recipe.id)
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
    this.trackUrl(scope)
  }

  async nextPage (next: PaginateNext, scope: ExtractionScope): Promise<NextPageResult> {
    if ('jsonpath' in next) throw new Error('next.jsonpath reads an api document; use next.selector or next.url in web mode')
    if ('url' in next) {
      const target = renderText(next.url, path => scope.lookup(path))
      if (target === '') return null
      await navigate({ type: 'goto', url: target }, this.page, scope, this.recipe.limits ?? {}, this.events, this.recipe.id)

      return { kind: 'url', url: this.page.url() }
    }
    // The page body may have navigated away (a forEach visiting every item);
    // pagination continues from the listing page the body started on.
    const listing = scope.pageState?.url
    if (listing !== undefined && listing !== '' && this.page.url() !== listing) await this.page.goto(listing)
    const link = this.page.locator(next.selector).first()
    if (!await appears(link, NEXT_LINK_TIMEOUT_MS)) return null
    const before = this.page.url()
    await link.click()
    await this.page.waitForLoadState()
    if (this.page.url() === before) await this.page.waitForTimeout(NEXT_LINK_TIMEOUT_MS / 4)
    this.events.emit({ type: 'page:visit', recipeId: this.recipe.id, url: this.page.url(), number: (scope.pageState?.number ?? 1) + 1 })

    return { kind: 'url', url: this.page.url() }
  }

  async elements (selector: string): Promise<LiveElement[]> {
    return snapshotElements(selector, this.page)
  }

  async dispose (): Promise<void> {
    await this.session.close()
  }
}
