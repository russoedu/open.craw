import type { CleanupOptions } from '../image-cleanup'

/*
 * The shapes of OpenCraw's captcha solver contract this package needs,
 * declared here rather than imported, so the reader carries no dependency on
 * the engine: any `CaptchaSolver` host that passes these fields works.
 */

/** An element on the page, as Playwright's `Locator` offers it. */
export interface ElementHandleLike {
  first:        () => ElementHandleLike
  screenshot:   () => Promise<Buffer>
  click:        () => Promise<void>
  fill:         (value: string) => Promise<void>
  getAttribute: (name: string) => Promise<string | null>
  isVisible:    () => Promise<boolean>
}

export interface PageLike {
  locator:        (selector: string) => ElementHandleLike
  waitForTimeout: (ms: number) => Promise<void>
}

/** The challenge as the engine hands it over: the image's selector, and the form's field and refresh control. */
export interface ChallengeLike {
  kind:      string
  url:       string
  selector?: string
  field?:    string
  refresh?:  string
}

export interface SolveContextLike {
  page:    PageLike
  attempt: number
  signal:  AbortSignal
  log:     (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
}

export type SolveOutcome = { status: 'solved' } | { status: 'failed', reason: string }
export type SolveVerdict = { status: 'solved' } | { status: 'rejected', reason: string }

/** One character Tesseract read, how sure it was (0–100), and where (pixels of the cleaned image). */
export interface ReadSymbol {
  text:       string
  confidence: number
  box?:       { x0: number, y0: number, x1: number, y1: number }
}

/** What one reading of an image gave. */
export interface ImageRead {
  /** What was read, kept to the charset. */
  text:       string
  /** Tesseract's text before filtering. */
  raw:        string
  /** The least sure character's confidence (0–100): whole-word confidence is too noisy on six loose characters. */
  confidence: number
  symbols:    ReadSymbol[]
  /** Why the read is not good enough to submit (a wrong length, a low confidence), when it is not. */
  problem?:   string
  /** The image as captured, and as Tesseract saw it after cleanup (PNG). */
  image:      Buffer
  cleaned:    Buffer
  durationMs: number
}

/** One read as the audit sees it, with how it ended. */
export interface TesseractRead extends ImageRead {
  url:     string
  /** The engine's attempt, from 1. */
  attempt: number
  /** The read within the attempt, from 1: each refresh adds one. */
  read:    number
  /** `refreshed`: not good enough, never submitted. `rejected` / `solved`: submitted, and what the page said. */
  outcome: 'refreshed' | 'rejected' | 'solved'
  reason?: string
}

export interface TesseractReaderOptions {
  /** The name recipes use. Default `tesseract`. */
  name?:          string
  /** The characters the captcha uses: a list with ranges (`'A-Za-z0-9'`, the default) or a one-character RegExp class. */
  charset?:       string | RegExp
  /** The code's length, or its range. A read of another length is refreshed, never submitted. */
  length?:        number | [number, number]
  /** Whether `a` and `A` differ. Default `false`: each letter allows its other case too. */
  caseSensitive?: boolean
  /** The least confidence (0–100) every character must have. Default 50. */
  minConfidence?: number
  /** Reads (after refreshing the image) before an attempt gives up. Default 5. */
  refreshes?:     number
  /** Image cleanup before OCR. */
  preprocess?:    CleanupOptions
  /** Tesseract's page segmentation mode: 7 one line (default), 8 one word, 13 a raw line. */
  pageSegMode?:   7 | 8 | 13
  /** Tesseract language (default `eng`) and where its `.traineddata.gz` is (default: the bundled English model). */
  lang?:          string
  langPath?:      string
  /** Called for every read; a throw is logged and ignored. */
  audit?:         (read: TesseractRead) => Promise<void> | void
  /** How long one attempt may take, refreshes included, when the recipe does not say. Default 60000. */
  timeoutMs?:     number
}

/** The reader: an OpenCraw captcha solver, and `read` for reading an image directly. */
export interface TesseractReader {
  readonly name:      string
  readonly timeoutMs: number
  solve (challenge: ChallengeLike, context: SolveContextLike): Promise<SolveOutcome>
  verdict (challenge: ChallengeLike, verdict: SolveVerdict): Promise<void>
  close (): Promise<void>
  /** Reads a captcha image (PNG bytes) and judges the read, without a page. */
  read (png: Buffer): Promise<ImageRead>
}
