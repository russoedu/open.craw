/** Options every command shares. */
export interface CommonOptions {
  /** A browser binary other than the one Playwright installed. */
  browserPath?:   string
  /** Accept an intercepting proxy's certificate. */
  insecureTls:    boolean
  /** A user agent for requests and the browser. */
  userAgent?:     string
  /** An access config file (proxy profiles); `OPENCRAW_ACCESS` when not given. */
  access?:        string
  /** The access profile to use by default, overriding the config's `default`. */
  accessProfile?: string
  /** A plugins module: hooks, access plugins; `--hooks` / `OPENCRAW_PLUGINS` / `OPENCRAW_HOOKS` too. */
  plugins?:       string
}

export type Command =
  | { name: 'help' } |
  { name: 'version' } |
  { name: 'validate', paths: string[] } |
  {
    name:      'run'
    paths:     string[]
    /** A JSON Lines file; records go to stdout without it. */
    out?:      string
    append:    boolean
    resume:    boolean
    trace:     boolean
    /** One record per input, with the scope it was mapped from. */
    dryRun:    boolean
    /** Run only the input recipes with these ids. */
    only:      string[]
    headed:    boolean
    /** Tries per request for recipes whose `limits.retry` says nothing (1 turns retrying off). */
    retries?:  number
    /** Where `session.browserProfile` profiles live; `OPENCRAW_PROFILES` when not given. */
    profiles?: string
    /** Per-site politeness across every recipe: overrides the access config's `throttle` defaults. */
    throttle:  { delayMs?: number, concurrency?: number }
    options:   CommonOptions
  } |
  {
    name:    'probe'
    url:     string
    /** Also render the page in a browser and watch the JSON it fetches. */
    browser: boolean
    options: CommonOptions
  }
