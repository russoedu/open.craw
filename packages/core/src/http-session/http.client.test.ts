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
      case '/listino.csv': {
        outgoing.setHeader('content-type', 'text/csv')
        outgoing.end(readFileSync(join(__dirname, '..', 'workbook-document', 'fixtures', 'listino.csv')))

        break
      }
      case '/incentivi': {
        outgoing.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        outgoing.end(readFileSync(join(__dirname, '..', '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')))

        break
      }
      case '/deck': {
        outgoing.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        outgoing.end(readFileSync(join(__dirname, '..', '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')))

        break
      }
      case '/catalogue': {
        outgoing.setHeader('content-type', 'application/yaml')
        outgoing.end('models:\n  - name: Pandina\n    tag: !custom x\n')

        break
      }
      case '/latin': {
        outgoing.setHeader('content-type', 'text/plain; charset=ISO-8859-1')
        outgoing.end(Buffer.from([0x43, 0xE9]))

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

  it('reads a CSV by content type or extension into a workbook, decoding and detecting as it goes', async () => {
    const client = await HttpClient.open()
    try {
      const csv = await client.send({ url: `${base}/listino.csv` })
      expect(csv.body).toMatchObject({ kind: 'workbook', sheets: [{ name: 'listino' }], csv: { encoding: 'windows-1252', delimiter: ';' } })
      const forced = await client.send({ url: `${base}/listino.csv`, as: 'csv', delimiter: ',', encoding: 'utf8' })
      expect(forced.body).toMatchObject({ csv: { encoding: expect.stringMatching(/^utf-8$/), delimiter: ',' } })
      // A delimiter only concerns a CSV: a body the content type reads as something else ignores it.
      const page = await client.send({ url: `${base}/page`, delimiter: ';' })
      expect(page.body.kind).toBe('html')
      const tsv = await client.send({ url: pathToFileURL(join(__dirname, '..', 'workbook-document', 'fixtures', 'listino.tsv')).href })
      expect(tsv.body).toMatchObject({ kind: 'workbook', sheets: [{ name: 'listino', rows: [['Marke', 'Modell', 'Preis'], ['Škoda', 'Elroq', '33.900'], ['Volkswagen', 'ID.3', '36.900']] }], csv: { encoding: 'utf-16le', delimiter: '\t' } })
      const latin = await client.send({ url: `${base}/latin` })
      expect(latin.body).toEqual({ kind: 'text', text: 'Cé' })
    } finally {
      await client.dispose()
    }
  })

  it('reads a spreadsheet by content type or extension into a workbook, and says what to do with a legacy one', async () => {
    const client = await HttpClient.open()
    try {
      const served = await client.send({ url: `${base}/incentivi` })
      expect(served.body).toMatchObject({ kind: 'workbook', sheets: [{ name: 'Incentivi giugno', hiddenRows: [6] }, { name: 'Archivio', hidden: true }, { name: 'Maggio' }] })
      const local = await client.send({ url: pathToFileURL(join(__dirname, '..', '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')).href })
      expect(local.body.kind === 'workbook' && local.body.sheets[0].rows[4]).toEqual(['Fiat', 'Pandina', 15_950, 13_955.625, 0.125, '2026-06-01', true, 'Solo rottamazione'])
      const directory = await mkdtemp(join(tmpdir(), 'http-client-'))
      await writeFile(join(directory, 'old.xls'), new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]))
      const legacy = pathToFileURL(join(directory, 'old.xls')).href
      await expect(client.send({ url: legacy })).rejects.toThrow(/old\.xls: a legacy binary Office file .* save it as \.xlsx/)
    } finally {
      await client.dispose()
    }
  })

  it('reads a presentation by content type or extension into a deck', async () => {
    const client = await HttpClient.open()
    try {
      const served = await client.send({ url: `${base}/deck` })
      expect(served.body).toMatchObject({ kind: 'deck', width: 960, height: 540 })
      const local = await client.send({ url: pathToFileURL(join(__dirname, '..', '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')).href })
      const titles = local.body.kind === 'deck' ? local.body.slides.map(slide => slide.title) : []
      expect(titles).toEqual(['Incentivi giugno', 'Griglia prezzi Jeep', 'Vendite', 'Bozza'])
    } finally {
      await client.dispose()
    }
  })

  it('reads YAML by content type or extension into JSON data, and reports what the parser noticed', async () => {
    const client = await HttpClient.open()
    try {
      const served = await client.send({ url: `${base}/catalogue` })
      expect(served.body).toEqual({ kind: 'json', data: { models: [{ name: 'Pandina', tag: 'x' }] } })
      expect(served.warnings).toEqual([expect.stringMatching(/Unresolved tag/)])
      const directory = await mkdtemp(join(tmpdir(), 'http-client-'))
      await writeFile(join(directory, 'list.yml'), 'zip: 0123\n')
      const url = pathToFileURL(join(directory, 'list.yml')).href
      const typed = await client.send({ url })
      expect(typed.body).toEqual({ kind: 'json', data: { zip: 123 } })
      const verbatim = await client.send({ url, scalars: 'text' })
      expect(verbatim.body).toEqual({ kind: 'json', data: { zip: '0123' } })
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
