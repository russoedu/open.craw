import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from 'playwright'
import type { APIRequestContext, APIResponse } from 'playwright'
import { readPdf } from '../pdf-document'
import { HttpError } from './http-response.contract'
import type { HttpBody, HttpRequest, HttpResponse, HttpSender } from './http-response.contract'

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
    const body = await readBody(response, httpRequest.as)
    const result: HttpResponse = { status: response.status(), url: response.url(), headers: response.headers(), body }
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

async function readBody (response: APIResponse, as: HttpRequest['as']): Promise<HttpBody> {
  const kind = as ?? kindFromContentType(response.headers()['content-type'] ?? '')

  return parseBody(kind, await response.body(), response.url())
}

/**
 * A `file:` URL, read from disk: a PDF or JSON a recipe gets from a folder
 * instead of a server. The kind is `as`, else the file extension.
 */
async function readLocalFile (httpRequest: HttpRequest): Promise<HttpResponse> {
  const path = fileURLToPath(httpRequest.url)
  const bytes = await readFile(path)

  return { status: 200, url: httpRequest.url, headers: {}, body: await parseBody(httpRequest.as ?? kindFromExtension(extname(path)), bytes, httpRequest.url) }
}

async function parseBody (kind: HttpBody['kind'], bytes: Uint8Array, url: string): Promise<HttpBody> {
  if (kind === 'pdf') return readPdf(bytes, url)
  const text = new TextDecoder().decode(bytes)
  if (kind === 'json') {
    try {
      return { kind: 'json', data: JSON.parse(text) as unknown }
    } catch (error) {
      throw new Error(`${url}: body is not JSON (${(error as Error).message})`, { cause: error })
    }
  }

  return kind === 'html' ? { kind: 'html', html: text } : { kind: 'text', text }
}

function kindFromContentType (contentType: string): HttpBody['kind'] {
  const type = contentType.toLowerCase()
  if (type.includes('json')) return 'json'
  if (type.includes('pdf')) return 'pdf'
  if (type.includes('html') || type.includes('xml')) return 'html'

  return 'text'
}

function kindFromExtension (extension: string): HttpBody['kind'] {
  const kinds: Record<string, HttpBody['kind']> = { '.json': 'json', '.pdf': 'pdf', '.html': 'html', '.htm': 'html', '.xml': 'html' }

  return kinds[extension.toLowerCase()] ?? 'text'
}
