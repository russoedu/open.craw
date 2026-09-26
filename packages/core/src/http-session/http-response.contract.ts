import type { DeckDocument } from '../deck-document'
import type { PdfDocument } from '../pdf-document'
import type { WorkbookDocument } from '../workbook-document'
import type { XmlDocument } from '../xml-document'
import type { BodyKind, HttpMethod } from '../recipe-schema'

/** One HTTP request as the api runner sends it, templates already rendered. */
export interface HttpRequest {
  method?:    HttpMethod
  url:        string
  query?:     Record<string, string>
  headers?:   Record<string, string>
  body?:      unknown
  /** How to read the body; default: from the response content type. */
  as?:        BodyKind
  /** The encoding of a text body (a WHATWG label); default: the BOM, the declared charset, UTF-8, else Windows-1252. */
  encoding?:  string
  /** A CSV body's delimiter (one character); default: detected. */
  delimiter?: string
  /** A YAML body's scalars: `typed` (default) or `text`. */
  scalars?:   'typed' | 'text'
  timeoutMs?: number
}

/** A parsed response body. Structurally the same as a scope document, on purpose. */
export type HttpBody =
  PdfDocument | WorkbookDocument | DeckDocument | XmlDocument | { kind: 'json', data: unknown } | { kind: 'html', html: string } | { kind: 'text', text: string }

export interface HttpResponse {
  status:    number
  /** The final URL after redirects. */
  url:       string
  headers:   Record<string, string>
  body:      HttpBody
  /** What reading the body noticed but read anyway (an unknown YAML tag…). */
  warnings?: string[]
  /** The format the body was read as (`yaml` and `jsonl` both give JSON data). */
  format?:   BodyKind
}

/** The part of the client the api runner needs; tests fake it. */
export interface HttpSender {
  send: (request: HttpRequest) => Promise<HttpResponse>
}

/** A response with a 4xx or 5xx status. */
export class HttpError extends Error {
  override readonly name = 'HttpError'

  constructor (readonly status: number, readonly url: string, readonly body: HttpBody, readonly headers: Record<string, string> = {}) {
    super(`HTTP ${status} for ${url}`)
  }
}
