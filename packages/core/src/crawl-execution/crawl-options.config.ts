import type { AccessConfig, AccessPlugin } from '../access'
import type { BrowserSessionConfig } from '../browser-session'
import type { CaptchaSolver } from '../captcha'
import type { CrawlListener } from '../crawl-events'
import type { HookMap } from '../hooks'
import type { ThrottleConfig } from '../step-flow'
import type { RetryRule } from '../recipe-schema'
import type { DedupeScope, RecordSink } from '../record-sink'

/** How a crawler is created. Everything is optional. */
export interface CrawlOptions {
  /** Browser launch settings for web recipes and bootstraps. */
  browser?:         BrowserSessionConfig
  /** Handlers recipes reference by name. */
  hooks?:           HookMap
  /** Where records go; default: kept in memory and returned in the report. */
  sink?:            RecordSink
  onEvent?:         CrawlListener
  /** Default `run`: a key seen once is dropped for the rest of the run. */
  dedupe?:          DedupeScope
  /**
   * How many input recipes of a set run at once; default 1, one after
   * another. Each has its own browser context or HTTP session; the browser,
   * the sink and the per-site `throttle` are shared.
   */
  parallel?:        number
  /** Whether a failed input recipe stops the run; default `continue`. */
  onRecipeError?:   'continue' | 'stop'
  /** Base directory for relative `storageStatePath` and `saveTo` values. */
  storageStateDir?: string
  /**
   * Where `session.browserProfile` profiles live, one directory each. Default:
   * `.opencraw/profiles` under `storageStateDir` (or the working directory).
   */
  profilesDir?:     string
  /**
   * Skip records whose key the sink already has (`sink.has`), reporting them as
   * `skipped`. Needs a sink that can answer, such as `jsonLinesSink(path, { append: true })`.
   */
  resume?:          boolean
  /** Attach the scope snapshot to `record:emit` and `record:reject` events, for inspecting what a mapping saw. */
  debug?:           boolean
  /**
   * Where traffic goes: named proxy profiles (presets for common providers,
   * credentials as `{{env.NAME}}`) and the default one. Recipes pick a profile
   * with `session.access.profile`. Without it every recipe goes direct.
   */
  access?:          AccessConfig
  /**
   * How gently each site is crawled, across every recipe this crawler runs:
   * `delayMs` between request starts and `concurrency` requests in flight,
   * per site, with `domains` for site-specific rules. Defaults to
   * `access.throttle`; without either, only each recipe's `limits` apply.
   */
  throttle?:        ThrottleConfig
  /**
   * How a request that fails in passing (a dropped connection, a timeout, a
   * 503, a 429) is sent again, for recipes whose `limits.retry` says
   * nothing: `{ attempts?, backoffMs?, maxDelayMs?, statuses? }`. Default:
   * three tries, one then two seconds apart, `Retry-After` honoured.
   */
  retry?:           RetryRule
  /** Plugins `{ kind: 'plugin', name }` profiles refer to. */
  accessPlugins?:   AccessPlugin[]
  /** Solvers recipes name in `session.captcha.solver` and `captcha` steps. */
  captchaSolvers?:  CaptchaSolver[]
}
