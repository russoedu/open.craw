import { OfficeReadError } from '../read-error'

/**
 * Where a file comes from: a path or a `file:` URL (Node only), bytes in any
 * binary form, a `Blob` or `File`, a web `ReadableStream`, or any async
 * iterable of chunks (Node streams included). A string is always a path.
 */
export type OfficeSource =
  | string |
  URL |
  Uint8Array |
  ArrayBuffer |
  ArrayBufferView |
  Blob |
  ReadableStream<Uint8Array> |
  AsyncIterable<Uint8Array>

/**
 * Reads a source into one `Uint8Array`. Only a path or a `file:` URL touches
 * the file system, through a dynamic import, so the package runs in browsers,
 * workers and edge runtimes too. Fetching is the caller's job: an `http:` URL
 * is refused.
 *
 * @param source - The file.
 * @returns Its bytes.
 * @throws OfficeReadError (`bad-source`) for anything else.
 */
export async function readSource (source: OfficeSource): Promise<Uint8Array> {
  if (typeof source === 'string') return readPath(source)
  if (source instanceof URL) {
    if (source.protocol !== 'file:') throw new OfficeReadError('bad-source', `${source.href}: office-reader reads files, not URLs; fetch it and pass the bytes`)

    return readPath(source)
  }
  if (source instanceof Uint8Array) return source
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  if (typeof Blob !== 'undefined' && source instanceof Blob) return new Uint8Array(await source.arrayBuffer())
  if (isReadableStream(source)) return concat(await readStream(source))
  if (isAsyncIterable(source)) return concat(await readIterable(source))
  throw new OfficeReadError('bad-source', 'office-reader reads a path, a file: URL, bytes, a Blob, a ReadableStream or an async iterable of bytes')
}

async function readPath (path: string | URL): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises')

  return new Uint8Array(await readFile(path))
}

function isReadableStream (value: unknown): value is ReadableStream<Uint8Array> {
  return typeof value === 'object' && value !== null && typeof (value as { getReader?: unknown }).getReader === 'function'
}

function isAsyncIterable (value: unknown): value is AsyncIterable<Uint8Array> {
  return typeof value === 'object' && value !== null && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
}

async function readStream (stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return chunks
    chunks.push(chunkOf(value))
  }
}

async function readIterable (iterable: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = []
  for await (const chunk of iterable) chunks.push(chunkOf(chunk))

  return chunks
}

function chunkOf (chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk
  throw new OfficeReadError('bad-source', 'a stream of text is not a file: read it as bytes (no encoding set)')
}

function concat (chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0]
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }

  return bytes
}
