import { chromium, firefox, webkit } from 'playwright'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright'
import { DEFAULT_BROWSER_CONFIG } from './browser-session.config'
import type { BrowserSessionConfig } from './browser-session.config'

/** Playwright's storage state: cookies plus per-origin local storage. */
export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

/** What a session starts from. */
export interface SessionOptions {
  storageState?: StorageState
  cookies?:      Parameters<BrowserContext['addCookies']>[0]
  headers?:      Record<string, string>
  userAgent?:    string
  viewport?:     { width: number, height: number }
}

/** One browser context with one page: the unit a recipe runs in. */
export class BrowserSession {
  constructor (readonly context: BrowserContext, readonly page: Page) {}

  /** The cookies and storage this session holds now, in the shape an HTTP client or a later run can reuse. */
  storageState (): Promise<StorageState> {
    return this.context.storageState()
  }

  async close (): Promise<void> {
    await this.context.close()
  }
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

  private constructor (private readonly browser: Browser, private readonly config: BrowserSessionConfig) {}

  async newSession (options: SessionOptions = {}): Promise<BrowserSession> {
    const contextOptions: BrowserContextOptions = {
      storageState:      options.storageState,
      extraHTTPHeaders:  options.headers,
      userAgent:         options.userAgent,
      viewport:          options.viewport,
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors,
    }
    const context = await this.browser.newContext(contextOptions)
    if (this.config.timeoutMs !== undefined) context.setDefaultTimeout(this.config.timeoutMs)
    if (options.cookies !== undefined && options.cookies.length > 0) await context.addCookies(options.cookies)
    const page = await context.newPage()

    return new BrowserSession(context, page)
  }

  async close (): Promise<void> {
    await this.browser.close()
  }
}
