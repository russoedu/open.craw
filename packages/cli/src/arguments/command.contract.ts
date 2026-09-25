/** Options every command shares. */
export interface CommonOptions {
  /** A browser binary other than the one Playwright installed. */
  browserPath?: string
  /** Accept an intercepting proxy's certificate. */
  insecureTls:  boolean
  /** A user agent for requests and the browser. */
  userAgent?:   string
}

export type Command =
  | { name: 'help' } |
  { name: 'version' } |
  { name: 'validate', paths: string[] } |
  {
    name:    'run'
    paths:   string[]
    /** A JSON Lines file; records go to stdout without it. */
    out?:    string
    append:  boolean
    resume:  boolean
    trace:   boolean
    /** One record per input, with the scope it was mapped from. */
    dryRun:  boolean
    /** Run only the input recipes with these ids. */
    only:    string[]
    headed:  boolean
    options: CommonOptions
  } |
  {
    name:    'probe'
    url:     string
    /** Also render the page in a browser and watch the JSON it fetches. */
    browser: boolean
    options: CommonOptions
  }
