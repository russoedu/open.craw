import { BrowserClient } from '../browser-session'
import { EventBus } from '../crawl-events'
import { HookRegistry } from '../hooks'
import type { RecipeSet } from '../recipe-loading'
import { DedupePolicy, memorySink } from '../record-sink'
import type { CrawlOptions } from './crawl-options.config'
import type { CrawlReport } from './crawl-report.model'
import { runCrawl } from './run-crawl.use-case'

/** A configured engine: run recipe sets, then close it to release the browser. */
export interface Crawler {
  run:   (set: RecipeSet) => Promise<CrawlReport>
  /** Closes the browser if one was launched. Safe to call more than once. */
  close: () => Promise<void>
}

/**
 * Creates a crawler. The browser is launched lazily, on the first recipe or
 * bootstrap that needs it, and shared by every run until `close`.
 *
 * @param options - Hooks, sink, events, browser settings, policies.
 * @returns The crawler.
 */
export function createCrawler (options: CrawlOptions = {}): Crawler {
  const hooks = new HookRegistry(options.hooks)
  const events = new EventBus(options.onEvent)
  let browser: Promise<BrowserClient> | undefined
  const launch = (): Promise<BrowserClient> => {
    browser ??= BrowserClient.launch(options.browser)

    return browser
  }

  return {
    run: set => runCrawl(set, {
      browser:         launch,
      hooks,
      events,
      sink:            options.sink ?? memorySink(),
      dedupe:          new DedupePolicy(options.dedupe),
      storageStateDir: options.storageStateDir,

      ignoreHTTPSErrors: options.browser?.ignoreHTTPSErrors,
    }, options.onRecipeError ?? 'continue'),
    async close () {
      const launched = browser
      browser = undefined
      if (launched === undefined) return
      const client = await launched
      await client.close()
    },
  }
}
