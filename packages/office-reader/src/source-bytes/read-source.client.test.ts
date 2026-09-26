import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { OfficeReadError } from '../read-error'
import { readSource } from './read-source.client'

const path = join(__dirname, '..', 'spreadsheet', 'fixtures', 'incentivi.xlsx')
const bytes = new Uint8Array(readFileSync(path))

describe('readSource', () => {
  it('reads a path and a file: URL', async () => {
    expect(await readSource(path)).toEqual(bytes)
    expect(await readSource(pathToFileURL(path))).toEqual(bytes)
  })

  it('takes bytes in any binary form', async () => {
    expect(await readSource(bytes)).toBe(bytes)
    const copy = new Uint8Array(bytes)
    expect(await readSource(copy.buffer)).toEqual(bytes)
    const padded = new Uint8Array(bytes.length + 4)
    padded.set(bytes, 2)
    expect(await readSource(new DataView(padded.buffer, 2, bytes.length))).toEqual(bytes)
  })

  it('reads a Blob, a web stream and a Node stream', async () => {
    expect(await readSource(new Blob([bytes]))).toEqual(bytes)
    const blob = new Blob([bytes])
    expect(await readSource(blob.stream())).toEqual(bytes)
    const chunks = [bytes.subarray(0, 100), bytes.subarray(100)]
    expect(await readSource(Readable.from(chunks))).toEqual(bytes)
  })

  it('refuses URLs, text streams and anything else, with a code', async () => {
    await expect(readSource(new URL('https://example.com/a.xlsx'))).rejects.toMatchObject({ code: 'bad-source' })
    await expect(readSource(Readable.from(['text']))).rejects.toThrow(OfficeReadError)
    await expect(readSource(42 as unknown as Uint8Array)).rejects.toMatchObject({ code: 'bad-source' })
  })
})
