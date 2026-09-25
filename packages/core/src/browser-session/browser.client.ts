import { chromium, firefox, webkit } from 'playwright'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright'
import { DEFAULT_BROWSER_CONFIG } from './browser-session.config'
import type { BrowserSessionConfig } from './browser-session.config'

/** Playwright's storage state: cookies plus per-origin local storage. */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

/** What a session starts from. */
export interface SessionOptions {
  storageState?:      StorageState
  cookies?:           Parameters<BrowserContext['addCookies']>[0]
  headers?:           Record<string, string>
  userAgent?:         string
  viewport?:          { width: number, height: number }
  /** A proxy for this context only; overrides the launch-level `proxy`. */
  proxy?:             { server: string, username?: string, password?: string, bypass?: string }
  /** Also accept invalid certificates in this context (a proxy that intercepts HTTPS). */
  ignoreHTTPSErrors?: boolean
  /** Resource types this context never loads (`image`, `font`, `media`...), to save proxy bandwidth. */
  blockResources?:    readonly string[]
}

/** One browser context with one page: the unit a recipe runs in. */
export class BrowserSession {
  /**
   * @param context - The browser context.
   * @param page - Its page.
   * @param closer - How to end the session; closing the context by default. A remote browser disconnects instead.
   */
  constructor (readonly context: BrowserContext, readonly page: Page, private readonly closer?: () => Promise<void>) {}

  /** The cookies and storage this session holds now, in the shape an HTTP client or a later run can reuse. */
  storageState (): Promise<StorageState> {
    return this.context.storageState()
  }

  async close (): Promise<void> {
    await (this.closer === undefined ? this.context.close() : this.closer())
  }
}

/**
 * Aborts every request of the given resource types in a context. Per-GB
 * proxies bill images and fonts like everything else; a crawl rarely needs them.
 *
 * @param context - The browser context.
 * @param types - Playwright resource types to skip.
 */
async function blockResources (context: BrowserContext, types: ReadonlySet<string>): Promise<void> {
  await context.route('**/*', async (route) => {
    if (types.has(route.request().resourceType())) {
      await route.abort()

      return
    }
    await route.continue()
  })
}

/** A launched browser; sessions are opened from it and closed independently. */
export class BrowserClient {
  static async launch (config: BrowserSessionConfig = {}): Promise<BrowserClient> {
    const type = config.browserType ?? DEFAULT_BROWSER_CONFIG.browserType
    const launcher = type === 'firefox' ? firefox : (type === 'webkit' ? webkit : chromium)
    const browser = await launcher.launch({
      headless:       config.headless ?? DEFAULT_BROWSER_CONFIG.headless,
      slowMo:         config.slowMo,
      executablePath: config.executablePath,
      proxy:          config.proxy,
    })

    return new BrowserClient(browser, config)
  }

  /**
   * A session in a remote browser, over the Chrome DevTools Protocol. The
   * provider's own context is reused when it offers one (several providers
   * pin the proxy and fingerprint to it); cookies, headers, blocked resources
   * and the viewport are applied to it. Closing the session disconnects,
   * which ends it on the provider's side.
   *
   * @param cdp - The endpoint and connection headers.
   * @param options - What the session starts from. `userAgent` cannot change on an existing context and is ignored.
   * @param timeoutMs - For the connection and every action.
   * @returns The session.
   */
  static async connectOverCDP (cdp: { endpoint: string, headers?: Record<string, string> }, options: SessionOptions = {}, timeoutMs?: number): Promise<BrowserSession> {
    const browser = await chromium.connectOverCDP(cdp.endpoint, { headers: cdp.headers, timeout: timeoutMs })
    const context = browser.contexts()[0] ?? await browser.newContext()
    if (timeoutMs !== undefined) context.setDefaultTimeout(timeoutMs)
    const cookies = [...(options.storageState?.cookies ?? []), ...(options.cookies ?? [])]
    if (cookies.length > 0) await context.addCookies(cookies)
    if (options.headers !== undefined) await context.setExtraHTTPHeaders(options.headers)
    if (options.blockResources !== undefined && options.blockResources.length > 0) await blockResources(context, new Set(options.blockResources))
    const page = await context.newPage()
    if (options.viewport !== undefined) await page.setViewportSize(options.viewport)

    return new BrowserSession(context, page, async () => {
      await browser.close()
    })
  }

  private constructor (private readonly browser: Browser, private readonly config: BrowserSessionConfig) {}

  async newSession (options: SessionOptions = {}): Promise<BrowserSession> {
    const contextOptions: BrowserContextOptions = {
      storageState:      options.storageState,
      extraHTTPHeaders:  options.headers,
      userAgent:         options.userAgent,
      viewport:          options.viewport,
      proxy:             options.proxy,
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors === true || options.ignoreHTTPSErrors === true,
    }
    const context = await this.browser.newContext(contextOptions)
    if (this.config.timeoutMs !== undefined) context.setDefaultTimeout(this.config.timeoutMs)
    if (options.cookies !== undefined && options.cookies.length > 0) await context.addCookies(options.cookies)
    if (options.blockResources !== undefined && options.blockResources.length > 0) await blockResources(context, new Set(options.blockResources))
    const page = await context.newPage()

    return new BrowserSession(context, page)
  }

  async close (): Promise<void> {
    await this.browser.close()
  }
}
