import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createWorker, OEM } from 'tesseract.js'
import type { Block, PSM, Worker } from 'tesseract.js'
import type { ReadSymbol } from './reader.contract'

export interface EngineOptions {
  lang:        string
  langPath?:   string
  whitelist:   string
  pageSegMode: 7 | 8 | 13
}

/** The bundled English model: the small LSTM one, which is what a line of loose characters needs. */
function bundledLangPath (): string {
  const require = createRequire(import.meta.url)

  return join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')
}

/**
 * One Tesseract worker (a thread running Tesseract in WebAssembly), started
 * on the first read and reused: reads queue on it. The language data comes
 * from disk, never from a CDN, and nothing is cached in the working
 * directory.
 */
export class TesseractEngine {
  private worker: Promise<Worker> | undefined

  constructor (private readonly options: EngineOptions) {}

  private start (): Promise<Worker> {
    this.worker ??= (async (): Promise<Worker> => {
      const worker = await createWorker(this.options.lang, OEM.LSTM_ONLY, { langPath: this.options.langPath ?? bundledLangPath(), gzip: true, cacheMethod: 'none' })
      await worker.setParameters({ tessedit_char_whitelist: this.options.whitelist, tessedit_pageseg_mode: String(this.options.pageSegMode) as PSM })

      return worker
    })()

    return this.worker
  }

  /**
   * Reads one image.
   *
   * @param png - The cleaned image.
   * @returns The text and each character with its confidence.
   */
  async read (png: Buffer): Promise<{ raw: string, symbols: ReadSymbol[] }> {
    const worker = await this.start()
    const { data } = await worker.recognize(png, {}, { text: true, blocks: true })

    return { raw: data.text.trim(), symbols: symbolsOf(data.blocks ?? []) }
  }

  /** Stops the worker thread, if it started. */
  async close (): Promise<void> {
    const worker = this.worker
    this.worker = undefined
    if (worker === undefined) return
    const started = await worker
    await started.terminate()
  }
}

function symbolsOf (blocks: readonly Block[]): ReadSymbol[] {
  return blocks.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words.flatMap(word => word.symbols.map(symbol => ({ text: symbol.text, confidence: symbol.confidence, box: symbol.bbox }))))))
}
