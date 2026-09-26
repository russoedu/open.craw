import { AccessBroker } from '../access'
import { resolve } from 'node:path'
import { BrowserClient, BrowserProfiles } from '../browser-session'
import { CaptchaSolverRegistry } from '../captcha'
import { EventBus } from '../crawl-events'
import { HookRegistry } from '../hooks'
import type { RecipeSet } from '../recipe-loading'
import { DedupePolicy, memorySink } from '../record-sink'
import { HostThrottle } from '../step-flow'
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
 * @param options - Hooks, sink, events, browser settings, access, captcha solvers, policies.
 * @returns The crawler.
 * @throws AccessConfigError when the access config cannot work.
 * @throws Error when two captcha solvers share a name.
 */
export function createCrawler (options: CrawlOptions = {}): Crawler {
  const sink = options.sink ?? memorySink()
  if (options.resume === true && sink.has === undefined) throw new Error('resume needs a sink that can tell which keys it has (jsonLinesSink with append, memorySink, or a custom sink with `has`)')
  const access = new AccessBroker(options.access, options.accessPlugins)
  const hooks = new HookRegistry(options.hooks)
  const captchaSolvers = new CaptchaSolverRegistry(options.captchaSolvers)
  const hosts = new HostThrottle(options.throttle ?? options.access?.throttle)
  const profiles = new BrowserProfiles(options.profilesDir ?? resolve(options.storageStateDir ?? '.', '.opencraw', 'profiles'), options.browser)
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
      sink,
      dedupe:          new DedupePolicy(options.dedupe),
      storageStateDir: options.storageStateDir,
      resume:          options.resume === true,
      debug:           options.debug === true,
      access,
      captchaSolvers,
      hosts,
      profiles,

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
