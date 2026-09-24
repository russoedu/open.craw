import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { BrowserSessionConfig } from '../src/index'

/**
 * The shop the e2e recipes crawl. Three catalog pages of two products each,
 * product pages with a variants table, a login form that sets a cookie, and a
 * JSON API behind that cookie which paginates with `nextPage`. Web mode and api
 * mode must produce the same records from it.
 */
export const FIXTURE_PORT = 4545
export const FIXTURE_BASE = `http://127.0.0.1:${FIXTURE_PORT}`

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

function catalogHtml (page: number): string {
  const links = idsOn(page).map(id => `<a class="product" href="/product/${id}">Product ${id}</a>`).join('\n')
  const next = page < PAGES ? `<a class="next" href="/catalog?page=${page + 1}">next</a>` : ''

  return `<!doctype html><html lang="en"><head><title>Catalog ${page}</title></head><body><h1>Catalog page ${page}</h1>${links}${next}</body></html>`
}

function productHtml (item: Product): string {
  const rows = item.variants.map(variant => `<tr><td class="size">${variant.size}</td><td class="price">${variantMoney(variant.price)}</td></tr>`).join('')
  const images = item.images.map(source => `<img class="gallery" src="${source.replace(FIXTURE_BASE, '')}" alt="">`).join('')
  const stock = item.inStock ? '<p class="stock">In stock</p>' : ''

  return `<!doctype html><html lang="en"><head><title>${item.name}</title></head><body>
<h1>  ${item.name}  </h1><p class="price">Price: ${money(item.priceInt, item.priceCents)}</p>${images}${stock}
<table class="variants">${rows}</table><p class="seller"> ${item.seller} </p></body></html>`
}

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

    return html(catalogHtml(page))
  }
  if (url.pathname.startsWith('/product/')) {
    const id = Number(url.pathname.slice('/product/'.length))

    return html(productHtml(product(id)))
  }
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
 * Browser settings for the e2e runs. `OPEN_CRAW_CHROMIUM` points at a chromium
 * binary when the one `playwright install` would fetch is not available (a
 * sandbox with a preinstalled browser); unset, Playwright's own browser is used.
 */
export function browserConfig (): BrowserSessionConfig {
  const executablePath = process.env.OPEN_CRAW_CHROMIUM

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
