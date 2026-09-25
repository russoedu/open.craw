import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from 'playwright'
import type { APIRequestContext, APIResponse } from 'playwright'
import { readPptxDeck } from '../deck-document'
import { readPdf } from '../pdf-document'
import type { BodyKind } from '../recipe-schema'
import { csvWorkbook, readXlsxWorkbook, sheetNameOf } from '../workbook-document'
import { parseJsonLike, parseJsonLines } from '../selection'
import { readYaml } from '../yaml-document'
import { HttpError } from './http-response.contract'
import type { HttpBody, HttpRequest, HttpResponse, HttpSender } from './http-response.contract'
import { charsetOf, decodeText } from './text-decoding.algorithm'

/** Playwright's storage state: cookies plus per-origin local storage. */
export type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>

export interface HttpClientOptions {
  /** Cookies and storage captured by a browser session, or loaded from a file. */
  storageState?:      StorageState
  headers?:           Record<string, string>
  userAgent?:         string
  timeoutMs?:         number
  ignoreHTTPSErrors?: boolean
  /** Send every request through this proxy. */
  proxy?:             { server: string, username?: string, password?: string, bypass?: string }
}

/**
 * HTTP through Playwright's request context: cookies, redirects and storage
 * state behave exactly as they do in the browser, so a session captured by a
 * browser bootstrap can be reused without translation. No browser is launched.
 */
export class HttpClient implements HttpSender {
  static async open (options: HttpClientOptions = {}): Promise<HttpClient> {
    const context = await request.newContext({
      storageState:      options.storageState,
      extraHTTPHeaders:  options.headers,
      userAgent:         options.userAgent,
      ignoreHTTPSErrors: options.ignoreHTTPSErrors,
      timeout:           options.timeoutMs,
      proxy:             options.proxy,
    })

    return new HttpClient(context, options.timeoutMs)
  }

  private constructor (private readonly context: APIRequestContext, private readonly timeoutMs: number | undefined) {}

  /**
   * Sends a request and parses the body.
   *
   * @param httpRequest - What to send.
   * @returns The response.
   * @throws HttpError for a 4xx or 5xx status.
   */
  async send (httpRequest: HttpRequest): Promise<HttpResponse> {
    if (httpRequest.url.startsWith('file:')) return readLocalFile(httpRequest)
    const response = await this.context.fetch(httpRequest.url, {
      method:  httpRequest.method ?? (httpRequest.body === undefined ? 'GET' : 'POST'),
      params:  httpRequest.query,
      headers: httpRequest.headers,
      data:    httpRequest.body as string | Record<string, unknown> | undefined,
      timeout: httpRequest.timeoutMs ?? this.timeoutMs,
    })
    const { body, warnings, format } = await readBody(response, httpRequest)
    const result: HttpResponse = { status: response.status(), url: response.url(), headers: response.headers(), body, format, ...(warnings.length > 0 && { warnings }) }
    if (response.status() >= 400) throw new HttpError(response.status(), response.url(), body, response.headers())

    return result
  }

  /** The cookies and storage this context holds now. */
  storageState (): Promise<StorageState> {
    return this.context.storageState()
  }

  dispose (): Promise<void> {
    return this.context.dispose()
  }
}

/** A body as read, with what reading it noticed. */
interface ReadBody {
  body:     HttpBody
  warnings: string[]
  format:   BodyKind
}

async function readBody (response: APIResponse, httpRequest: HttpRequest): Promise<ReadBody> {
  const contentType = response.headers()['content-type'] ?? ''
  const format = httpRequest.as ?? formatFromContentType(contentType)

  return parseBody(format, await response.body(), response.url(), { ...httpRequest, charset: charsetOf(contentType) })
}

/**
 * A `file:` URL, read from disk: a PDF, spreadsheet, presentation, CSV, YAML
 * or JSON a recipe gets from a folder instead of a server. The format is `as`,
 * else the file extension.
 */
async function readLocalFile (httpRequest: HttpRequest): Promise<HttpResponse> {
  const path = fileURLToPath(httpRequest.url)
  const bytes = await readFile(path)
  const { body, warnings, format } = await parseBody(httpRequest.as ?? formatFromExtension(extname(path)), bytes, httpRequest.url, httpRequest)

  return { status: 200, url: httpRequest.url, headers: {}, body, format, ...(warnings.length > 0 && { warnings }) }
}

async function parseBody (format: BodyKind, bytes: Uint8Array, url: string, reading: { encoding?: string, delimiter?: string, scalars?: 'typed' | 'text', charset?: string }): Promise<ReadBody> {
  if (format === 'yaml') {
    const { text } = decodeText(bytes, reading)
    const { data, warnings } = await readYaml(text, url, reading.scalars)

    return { body: { kind: 'json', data }, warnings, format }
  }

  return { body: await parseFormat(format, bytes, url, reading), warnings: [], format }
}

async function parseFormat (format: BodyKind, bytes: Uint8Array, url: string, reading: { encoding?: string, delimiter?: string, charset?: string }): Promise<HttpBody> {
  if (format === 'pdf') return readPdf(bytes, url)
  if (format === 'xlsx') return readXlsxWorkbook(bytes, url)
  if (format === 'pptx') return readPptxDeck(bytes, url)
  const { text, encoding } = decodeText(bytes, reading)
  if (format === 'csv') return csvWorkbook(text, { name: sheetNameOf(url), encoding, delimiter: reading.delimiter })
  if (format === 'jsonl') return { kind: 'json', data: parseJsonLines(text, url) }
  if (format === 'json') {
    const parsed = parseJsonLike(text)
    if ('error' in parsed) throw new Error(`${url}: body is not JSON (${parsed.error.message})${looksLikeJsonLines(text) ? '; it looks like JSON Lines: read it with "as": "jsonl"' : ''}`, { cause: parsed.error })

    return { kind: 'json', data: parsed.value }
  }

  return format === 'html' ? { kind: 'html', html: text } : { kind: 'text', text }
}

/** Several lines, the first of them JSON on its own. */
function looksLikeJsonLines (text: string): boolean {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length < 2) return false
  const first = parseJsonLike(lines[0])

  return 'value' in first
}

function formatFromContentType (contentType: string): BodyKind {
  const type = contentType.toLowerCase().split(';', 1)[0].trim()
  if (CSV_TYPES.has(type)) return 'csv'
  if (JSON_LINES_TYPES.has(type)) return 'jsonl'
  // A legacy .xls or .ppt goes to the Office reader too, which says what to do with it.
  if (type.includes('spreadsheetml') || type.startsWith('application/vnd.ms-excel')) return 'xlsx'
  if (type.includes('presentationml') || type.startsWith('application/vnd.ms-powerpoint')) return 'pptx'
  if (YAML_TYPES.has(type)) return 'yaml'
  if (type.includes('json')) return 'json'
  if (type.includes('pdf')) return 'pdf'
  if (type.includes('html') || type.includes('xml')) return 'html'

  return 'text'
}

const JSON_LINES_TYPES = new Set(['application/x-ndjson', 'application/ndjson', 'application/jsonl', 'application/x-jsonlines', 'application/jsonlines'])
const YAML_TYPES = new Set(['application/yaml', 'application/x-yaml', 'text/yaml', 'text/x-yaml'])
const CSV_TYPES = new Set(['text/csv', 'application/csv', 'text/x-csv', 'application/x-csv', 'text/comma-separated-values', 'text/tab-separated-values'])

function formatFromExtension (extension: string): BodyKind {
  const formats: Record<string, BodyKind> = { '.json': 'json', '.jsonl': 'jsonl', '.ndjson': 'jsonl', '.pdf': 'pdf', '.csv': 'csv', '.tsv': 'csv', '.xlsx': 'xlsx', '.xlsm': 'xlsx', '.xls': 'xlsx', '.pptx': 'pptx', '.pptm': 'pptx', '.ppsx': 'pptx', '.ppt': 'pptx', '.yaml': 'yaml', '.yml': 'yaml', '.html': 'html', '.htm': 'html', '.xml': 'html' }

  return formats[extension.toLowerCase()] ?? 'text'
}
