import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HttpClient } from './http.client'
import { HttpError } from './http-response.contract'

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', 'http://localhost')
    const cookie = incoming.headers.cookie ?? ''
    switch (url.pathname) {
      case '/login': {
        outgoing.setHeader('set-cookie', 'session=abc; Path=/')
        outgoing.end('ok')

        break
      }
      case '/api': {
        if (cookie.includes('session=abc')) {
          outgoing.setHeader('content-type', 'application/json; charset=utf-8')
          outgoing.end(JSON.stringify({ page: url.searchParams.get('page'), method: incoming.method, agent: incoming.headers['user-agent'], extra: incoming.headers['x-extra'] }))
        } else {
          outgoing.statusCode = 401
          outgoing.setHeader('content-type', 'application/json')
          outgoing.end('{"error":"login first"}')
        }

        break
      }
      case '/page': {
        outgoing.setHeader('content-type', 'text/html')
        outgoing.end('<html lang="en"><body><h1>Hi</h1></body></html>')

        break
      }
      case '/discounts': {
        outgoing.setHeader('content-type', 'application/pdf')
        outgoing.end(readFileSync(join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf')))

        break
      }
      case '/redirect': {
        outgoing.statusCode = 302
        outgoing.setHeader('location', '/page')
        outgoing.end()

        break
      }
      default: {
        outgoing.statusCode = 404
        outgoing.end('nope')
      }
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  // Playwright keeps connections alive; close() alone would wait for them to time out.
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => { server.close(error => (error === undefined ? resolve() : reject(error))) })
})

describe('HttpClient', () => {
  it('keeps cookies across requests and parses JSON by content type', async () => {
    const client = await HttpClient.open({ headers: { 'x-extra': '1' }, userAgent: 'opencraw-test' })
    try {
      await expect(client.send({ url: `${base}/api` })).rejects.toThrow(HttpError)
      await client.send({ url: `${base}/login` })
      const response = await client.send({ url: `${base}/api`, query: { page: '2' } })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ kind: 'json', data: { page: '2', method: 'GET', agent: 'opencraw-test', extra: '1' } })
      const state = await client.storageState()
      expect(state.cookies.map(cookie => cookie.name)).toEqual(['session'])
    } finally {
      await client.dispose()
    }
  })

  it('seeds a new client from a storage state', async () => {
    const first = await HttpClient.open()
    await first.send({ url: `${base}/login` })
    const state = await first.storageState()
    await first.dispose()
    const second = await HttpClient.open({ storageState: state })
    try {
      const response = await second.send({ url: `${base}/api` })
      expect(response.status).toBe(200)
    } finally {
      await second.dispose()
    }
  })

  it('reads HTML, follows redirects and honours an explicit body kind', async () => {
    const client = await HttpClient.open()
    try {
      const html = await client.send({ url: `${base}/redirect` })
      expect(html.url).toBe(`${base}/page`)
      expect(html.body.kind).toBe('html')
      const text = await client.send({ url: `${base}/page`, as: 'text' })
      expect(text.body).toEqual({ kind: 'text', text: '<html lang="en"><body><h1>Hi</h1></body></html>' })
      await expect(client.send({ url: `${base}/page`, as: 'json' })).rejects.toThrow(/not JSON/)
      const missing = client.send({ url: `${base}/missing` })
      await expect(missing).rejects.toThrow('HTTP 404')
    } finally {
      await client.dispose()
    }
  })

  it('reads a PDF by content type, and local files by extension', async () => {
    const client = await HttpClient.open()
    try {
      const pdf = await client.send({ url: `${base}/discounts` })
      expect(pdf.body.kind).toBe('pdf')
      expect(pdf.body).toMatchObject({ kind: 'pdf', pages: [{ number: 1 }, { number: 2 }] })
      const pdfPath = join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf')
      const local = await client.send({ url: pathToFileURL(pdfPath).href })
      expect(local).toMatchObject({ status: 200, body: { kind: 'pdf' } })
      const directory = await mkdtemp(join(tmpdir(), 'http-client-'))
      const jsonUrl = pathToFileURL(join(directory, 'data.json')).href
      await writeFile(join(directory, 'data.json'), '{"a":1}')
      const json = await client.send({ url: jsonUrl })
      expect(json.body).toEqual({ kind: 'json', data: { a: 1 } })
      const text = await client.send({ url: jsonUrl, as: 'text' })
      expect(text.body).toEqual({ kind: 'text', text: '{"a":1}' })
      const missing = pathToFileURL(join(directory, 'missing.pdf')).href
      await expect(client.send({ url: missing })).rejects.toThrow(/ENOENT/)
    } finally {
      await client.dispose()
    }
  })
})
