/** How the browser is launched. Everything is optional; the default is headless chromium. */
export interface BrowserSessionConfig {
  browserType?:       'chromium' | 'firefox' | 'webkit'
  /** Default `true`. */
  headless?:          boolean
  /** Milliseconds added to every action, for watching a crawl. */
  slowMo?:            number
  /** A browser binary other than the one `playwright install` fetched. */
  executablePath?:    string
  proxy?:             { server: string, username?: string, password?: string, bypass?: string }
  /** Default navigation and action timeout in milliseconds. */
  timeoutMs?:         number
  ignoreHTTPSErrors?: boolean
}

export const DEFAULT_BROWSER_CONFIG: Required<Pick<BrowserSessionConfig, 'browserType' | 'headless'>> = { browserType: 'chromium', headless: true }
