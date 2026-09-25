import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { BrowserSessionConfig } from '../src/index'

/**
 * The shop the e2e recipes crawl. Three catalog pages of two products each,
 * product pages with a variants table, a login form that sets a cookie, and a
 * JSON API behind that cookie which paginates with `nextPage`. Web mode and api
 * mode must produce the same records from it.
 */
export const FIXTURE_PORT = Number(process.env.OPENCRAW_FIXTURE_PORT ?? '4545')
export const FIXTURE_BASE = `http://127.0.0.1:${FIXTURE_PORT}`

/** A CMS export in YAML: anchors, merge keys, a 1.1-style `NO` that 1.2 keeps as text. */
/** A spec page whose table merges a model's cells down its versions and a group header across its columns. */
const SPECS_PAGE = `<!doctype html><html lang="en"><head><title>Specs</title></head><body><h1>Specs</h1>
<table class="specs"><thead><tr><th rowspan="2">Model</th><th rowspan="2">Version</th><th colspan="2">Consumption</th></tr><tr><th>Urban</th><th>Mixed</th></tr></thead>
<tbody><tr><td rowspan="2">Pandina</td><td>1.0 Hybrid</td><td>5,2</td><td>4,9</td></tr><tr><td>1.0 Hybrid Cross</td><td>5,4</td><td>5,1</td></tr>
<tr><td>600e</td><td>La Prima</td><td>0</td><td>0</td></tr></tbody></table></body></html>`

const CATALOGUE_YAML = `defaults: &defaults
  brand: Fiat
  currency: EUR
  market: NO
models:
  - <<: *defaults
    name: Pandina
    price: 15950
  - <<: *defaults
    name: 600e
    price: 36950
  - <<: *defaults
    brand: Jeep
    name: Avenger
    price: 24950
`

const PAGES = 3
const PER_PAGE = 2

interface Product {
  id:         number
  name:       string
  priceInt:   number
  priceCents: string
  inStock:    boolean
  images:     string[]
  variants:   { size: string, price: string }[]
  seller:     string
}

function product (id: number): Product {
  return {
    id,
    name:       `Product ${id}`,
    priceInt:   1000 + id,
    priceCents: id % 2 === 0 ? '00' : '50',
    inStock:    id % 2 === 1,
    images:     [`${FIXTURE_BASE}/img/${id}-1.jpg`, `https://cdn.example/${id}-2.jpg`],
    variants:   [{ size: 'M', price: `${10 + id}.00` }, { size: 'L', price: `${12 + id}.50` }],
    seller:     `Seller ${id % 3}`,
  }
}

function idsOn (page: number): number[] {
  return Array.from({ length: PER_PAGE }, (_, index) => page * 10 + index + 1)
}

function money (integer: number, cents: string): string {
  return `${integer.toLocaleString('de-DE')},${cents} €`
}

function variantMoney (price: string): string {
  const [integer, cents] = price.split('.', 2)

  return money(Number(integer), cents)
}

/** Shown on the catalog until accepted; the click sets a cookie and removes it in place, no navigation. */
const CONSENT = `<div id="consent"><p>Cookies?</p><button id="accept">Accept</button></div>
<script>document.getElementById('accept').addEventListener('click', () => { document.cookie = 'consent=yes; Path=/'; document.getElementById('consent').remove() })</script>`

function catalogHtml (page: number, consented: boolean): string {
  const links = idsOn(page).map(id => `<a class="product" href="/product/${id}">Product ${id}</a>`).join('\n')
  const next = page < PAGES ? `<a class="next" href="/catalog?page=${page + 1}">next</a>` : ''

  return `<!doctype html><html lang="en"><head><title>Catalog ${page}</title></head><body>${consented ? '' : CONSENT}<h1>Catalog page ${page}</h1>${links}${next}</body></html>`
}

function productHtml (item: Product): string {
  const rows = item.variants.map(variant => `<tr><td class="size">${variant.size}</td><td class="price">${variantMoney(variant.price)}</td></tr>`).join('')
  const images = item.images.map(source => `<img class="gallery" src="${source.replace(FIXTURE_BASE, '')}" alt="">`).join('')
  const stock = item.inStock ? '<p class="stock">In stock</p>' : ''

  return `<!doctype html><html lang="en"><head><title>${item.name}</title></head><body>
<h1>  ${item.name}  </h1><p class="price">Price: ${money(item.priceInt, item.priceCents)}</p>${images}${stock}
<table class="variants">${rows}</table><p class="seller"> ${item.seller} </p></body></html>`
}

/** Trims of the configurator: value, label, price. The page re-renders `.trim` and `.price` from a `<select>` change. */
export const TRIMS = [['base', 'Base', '20.000 €'], ['sport', 'Sport', '24.500 €'], ['lux', 'Luxury', '29.900 €']] as const

const CONFIGURATOR = `<!doctype html><html lang="en"><head><title>Configurator</title></head><body>
<h1>Model X</h1>
<select id="trim">${TRIMS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
<p class="trim">${TRIMS[0][1]}</p><p class="price">${TRIMS[0][2]}</p>
<script>
  const prices = ${JSON.stringify(Object.fromEntries(TRIMS.map(([value, label, price]) => [value, { label, price }])))}
  document.getElementById('trim').addEventListener('change', (event) => {
    const chosen = prices[event.target.value]
    document.querySelector('.trim').textContent = chosen.label
    document.querySelector('.price').textContent = chosen.price
  })
</script></body></html>`

const LOGIN_FORM = '<!doctype html><html lang="en"><head><title>Login</title></head><body><form method="post" action="/login"><input id="user" name="user"><input id="pass" name="pass" type="password"><button type="submit">Go</button></form></body></html>'
const LOGGED_IN = '<!doctype html><html lang="en"><head><title>Account</title></head><body><p id="logged-in">Welcome</p></body></html>'

function handle (incoming: IncomingMessage, outgoing: ServerResponse): void {
  const url = new URL(incoming.url ?? '/', FIXTURE_BASE)
  const html = (body: string, status = 200): void => {
    outgoing.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
    outgoing.end(body)
  }
  const page = Number(url.searchParams.get('page') ?? '1')
  if (url.pathname === '/catalog') {
    if (page < 1 || page > PAGES) return html('<!doctype html><html lang="en"><body>gone</body></html>', 404)

    return html(catalogHtml(page, (incoming.headers.cookie ?? '').includes('consent=yes')))
  }
  if (url.pathname.startsWith('/product/')) {
    const id = Number(url.pathname.slice('/product/'.length))

    return html(productHtml(product(id)))
  }
  if (url.pathname === '/configurator') return html(CONFIGURATOR)
  if (url.pathname === '/login' && incoming.method === 'GET') return html(LOGIN_FORM)
  if (url.pathname === '/login' && incoming.method === 'POST') {
    let body = ''
    incoming.on('data', (chunk: Buffer) => { body += chunk.toString() })
    incoming.on('end', () => {
      const form = new URLSearchParams(body)
      if (form.get('user') === 'demo' && form.get('pass') === 'demo') {
        outgoing.writeHead(302, { 'set-cookie': 'session=ok; Path=/; HttpOnly', 'location': '/account' })
        outgoing.end()
      } else {
        html(LOGIN_FORM, 401)
      }
    })

    return
  }
  if (url.pathname === '/account') return html(LOGGED_IN)
  if (url.pathname === '/listino.csv') {
    // Windows-1252 with no charset declared, as many exports are served.
    outgoing.writeHead(200, { 'content-type': 'text/csv' })
    outgoing.end(readFileSync(join(__dirname, '..', 'src', 'workbook-document', 'fixtures', 'listino.csv')))

    return
  }
  if (url.pathname === '/incentivi.xlsx') {
    outgoing.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    outgoing.end(readFileSync(join(__dirname, '..', '..', 'office-reader', 'src', 'spreadsheet', 'fixtures', 'incentivi.xlsx')))

    return
  }
  if (url.pathname === '/incentivi.pptx') {
    outgoing.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    outgoing.end(readFileSync(join(__dirname, '..', '..', 'office-reader', 'src', 'presentation', 'fixtures', 'incentivi.pptx')))

    return
  }
  if (url.pathname === '/catalogue.yaml') {
    outgoing.writeHead(200, { 'content-type': 'application/yaml' })
    outgoing.end(CATALOGUE_YAML)

    return
  }
  if (url.pathname === '/products.jsonl') {
    // A bulk export: one product per line, as NDJSON.
    outgoing.writeHead(200, { 'content-type': 'application/x-ndjson' })
    outgoing.end('{"sku":"P-1","name":"Pandina","price":15950}\n{"sku":"P-2","name":"600e","price":36950}\n')

    return
  }
  if (url.pathname === '/legacy.js') {
    // An old endpoint that still answers JSONP.
    outgoing.writeHead(200, { 'content-type': 'text/javascript' })
    outgoing.end('jQuery3510_1712({"items":[{"sku":"J-1","name":"Avenger","price":24950}]});')

    return
  }
  if (url.pathname === '/listino.md') {
    // Served as GitHub raw serves it: text/plain.
    outgoing.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    outgoing.end(readFileSync(join(__dirname, '..', 'src', 'markdown-document', 'fixtures', 'listino.md')))

    return
  }
  if (url.pathname === '/specs') return html(SPECS_PAGE)
  if (url.pathname === '/discounts.pdf') {
    outgoing.writeHead(200, { 'content-type': 'application/pdf' })
    outgoing.end(readFileSync(join(__dirname, '..', 'src', 'pdf-document', 'fixtures', 'discounts.pdf')))

    return
  }
  if (url.pathname === '/api/products') {
    if (!(incoming.headers.cookie ?? '').includes('session=ok')) {
      outgoing.writeHead(401, { 'content-type': 'application/json' })
      outgoing.end('{"error":"login first"}')

      return
    }
    const items = idsOn(page).map((id) => {
      const item = product(id)

      return { url: `${FIXTURE_BASE}/product/${id}`, name: item.name, priceInt: item.priceInt, priceCents: item.priceCents, stock: item.inStock ? 3 : 0, images: item.images, variants: item.variants, seller: item.seller }
    })
    outgoing.writeHead(200, { 'content-type': 'application/json' })
    outgoing.end(JSON.stringify({ items, nextPage: page < PAGES ? `/api/products?page=${page + 1}` : null }))

    return
  }
  html('<!doctype html><html lang="en"><body>not found</body></html>', 404)
}

/**
 * Browser settings for the e2e runs. `OPENCRAW_CHROMIUM` points at a chromium
 * binary when the one `playwright install` would fetch is not available (a
 * sandbox with a preinstalled browser); unset, Playwright's own browser is used.
 */
export function browserConfig (): BrowserSessionConfig {
  const executablePath = process.env.OPENCRAW_CHROMIUM

  return executablePath === undefined || executablePath === '' ? {} : { executablePath }
}

/** Starts the fixture site on its fixed port. */
export async function startFixtureSite (): Promise<Server> {
  const server = createServer(handle)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(FIXTURE_PORT, '127.0.0.1', resolve)
  })

  return server
}

/** Stops the site, dropping keep-alive connections so the close completes. */
export async function stopFixtureSite (server: Server | undefined): Promise<void> {
  if (server === undefined) return
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => { server.close(error => (error === undefined ? resolve() : reject(error))) })
}

/** The records both recipes must produce, `scrapedAt` excluded, sorted by URL. */
export function expectedRecords (): Record<string, unknown>[] {
  const ids = Array.from({ length: PAGES }, (_, index) => idsOn(index + 1)).flat()

  return ids.map((id) => {
    const item = product(id)

    return {
      url:      `${FIXTURE_BASE}/product/${id}`,
      title:    item.name,
      price:    { amount: item.priceInt + Number(item.priceCents) / 100, currency: 'EUR' },
      inStock:  item.inStock,
      images:   item.images,
      variants: item.variants.map(variant => ({ size: variant.size, price: { amount: Number(variant.price), currency: 'EUR' } })),
      seller:   { name: item.seller },
    }
  }).sort((a, b) => a.url.localeCompare(b.url))
}
