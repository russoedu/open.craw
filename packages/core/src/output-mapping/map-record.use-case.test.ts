import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HookRegistry } from '../hooks'
import { parseInputRecipe, parseOutputRecipe } from '../recipe-schema'
import type { InputRecipe, OutputRecipe } from '../recipe-schema'
import { mapRecord } from './map-record.use-case'
import { MappingFailedError, RecordRejectedError } from './mapping.error'

function fixture (name: string): unknown {
  const path = join(__dirname, '..', 'recipe-schema', 'fixtures', name)

  return JSON.parse(readFileSync(path, 'utf8'))
}

const output = parseOutputRecipe(fixture('product.output.json'))
const web = parseInputRecipe(fixture('shop-web.input.json'))
const api = parseInputRecipe(fixture('shop-api.input.json'))
const hooks = new HookRegistry({ positive: (input: unknown) => Number(input) > 0 })

const webSnapshot = {
  raw_title:    '  Blue Shoe ',
  raw_price:    'Price: 1.299,00 €',
  imgs:         ['/img/1.jpg', '/img/1.jpg', 'https://cdn.example/2.jpg'],
  stock:        'In stock',
  variant_rows: ['<td class="size">M</td><td class="price">10,00 €</td>', '<td class="size">L</td><td class="price">12,50 €</td>'],
  seller:       ' Ann ',
  page:         { url: 'https://shop.example/p/1', number: 1 },
}

const apiItem = { url: 'https://shop.example/p/1', name: 'Blue Shoe', priceInt: 1299, priceCents: '00', stock: 3, images: ['https://cdn.example/1.jpg'], variants: [{ size: 'M', price: '10.00' }], seller: 'Ann' }

describe('mapRecord', () => {
  it('maps a web snapshot to a validated product record', async () => {
    const record = await mapRecord({ snapshot: webSnapshot, input: web, output, hooks, url: 'https://shop.example/p/1', emittedAt: '2026-01-01T00:00:00.000Z' })
    expect(record.data).toEqual({
      url:       'https://shop.example/p/1',
      title:     'Blue Shoe',
      price:     { amount: 1299, currency: 'EUR' },
      inStock:   true,
      images:    ['https://shop.example/img/1.jpg', 'https://cdn.example/2.jpg'],
      variants:  [{ size: 'M', price: { amount: 10, currency: 'EUR' } }, { size: 'L', price: { amount: 12.5, currency: 'EUR' } }],
      seller:    { name: 'Ann' },
      scrapedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(record.key).toBe('["https://shop.example/p/1"]')
    expect(record.source).toEqual({ recipeId: 'shop-web', url: 'https://shop.example/p/1', emittedAt: '2026-01-01T00:00:00.000Z' })
  })

  it('maps an api item through item.* paths, multi-source joins, each and hooks', async () => {
    const record = await mapRecord({ snapshot: { item: apiItem, page: { url: 'https://shop.example/api', number: 1 } }, input: api, output, hooks, url: 'https://shop.example/api' })
    expect(record.data.price).toEqual({ amount: 1299, currency: 'EUR' })
    expect(record.data.inStock).toBe(true)
    expect(record.data.variants).toEqual([{ size: 'M', price: { amount: 10, currency: 'EUR' } }])
    expect(record.data.seller).toEqual({ name: 'Ann' })
    expect(typeof record.data.scrapedAt).toBe('string')
  })

  it('applies the default policy when a mapped value is missing', async () => {
    const snapshot = { ...webSnapshot, stock: undefined }
    const record = await mapRecord({ snapshot, input: web, output, hooks, url: 'https://shop.example/p/1' })
    expect(record.data.inStock).toBe(false)
  })

  it('fills null for optional missing fields and fails for required ones', async () => {
    const snapshot = { ...webSnapshot, seller: undefined, imgs: undefined }
    const record = await mapRecord({ snapshot, input: web, output, hooks, url: 'https://shop.example/p/1' })
    expect(record.data.images).toBeNull()
    expect(record.data.seller).toBeNull()
    await expect(mapRecord({ snapshot: { ...webSnapshot, raw_title: '' }, input: web, output, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow(MappingFailedError)
    await expect(mapRecord({ snapshot: { ...webSnapshot, raw_title: '' }, input: web, output, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow('title: missing')
  })

  it('rejects the record under skip-record and reports coercion problems', async () => {
    const skipping: OutputRecipe = { ...output, onMissing: 'skip-record' }
    await expect(mapRecord({ snapshot: { ...webSnapshot, raw_title: undefined }, input: web, output: skipping, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow(RecordRejectedError)
    const badPrice: InputRecipe = { ...web, mapping: { ...web.mapping, price: { from: 'raw_price', onMissing: 'skip-record' } } }
    await expect(mapRecord({ snapshot: { ...webSnapshot, raw_price: 'call us' }, input: badPrice, output, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow(RecordRejectedError)
  })

  it('rejects the record, not the recipe, when a transform fails under a skip-record rule', async () => {
    const skipping: InputRecipe = { ...web, mapping: { ...web.mapping, price: { from: 'raw_price', transform: [{ op: 'number' }], onMissing: 'skip-record' } } }
    await expect(mapRecord({ snapshot: { ...webSnapshot, raw_price: 'OTR £' }, input: skipping, output, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow(RecordRejectedError)
    await expect(mapRecord({ snapshot: { ...webSnapshot, raw_price: 'OTR £' }, input: web, output, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow(MappingFailedError)
  })

  it('validates quality rules and enums', async () => {
    const strict: OutputRecipe = {
      kind:    'output',
      id:      'o',
      version: 1,
      fields:  { code: { type: 'string', pattern: '^[A-Z]{3}$', required: true }, kind: { type: 'enum', values: ['new', 'used'] }, qty: { type: 'integer', min: 1 } },
    }
    const input: InputRecipe = { kind: 'input', id: 'i', output: 'o', mode: 'api', start: [{ url: 'x' }], steps: [{ type: 'emit' }], mapping: { code: { from: 'c' }, kind: { from: 'k' }, qty: { from: 'q' } } }
    const good = await mapRecord({ snapshot: { c: 'ABC', k: 'used', q: '2' }, input, output: strict, hooks, url: 'x' })
    expect(good.data).toEqual({ code: 'ABC', kind: 'used', qty: 2 })
    expect(good.key).toBeNull()
    await expect(mapRecord({ snapshot: { c: 'abc', k: 'used', q: '2' }, input, output: strict, hooks, url: 'x' })).rejects.toThrow(/does not match/)
    await expect(mapRecord({ snapshot: { c: 'ABC', k: 'old', q: '2' }, input, output: strict, hooks, url: 'x' })).rejects.toThrow(/not one of new, used/)
    await expect(mapRecord({ snapshot: { c: 'ABC', k: 'new', q: '0' }, input, output: strict, hooks, url: 'x' })).rejects.toThrow(/below the minimum 1/)
  })

  it('wraps a failing transform with the target field', async () => {
    const input: InputRecipe = { ...web, mapping: { ...web.mapping, title: { from: 'raw_title', transform: [{ op: 'sum' }] } } }
    await expect(mapRecord({ snapshot: webSnapshot, input, output, hooks, url: 'https://shop.example/p/1' })).rejects.toThrow(/^mapping failed: title: transform "sum"/)
  })

  it('lets lookup and template inside each.fields reach ids extracted outside the loop', async () => {
    const options: OutputRecipe = parseOutputRecipe({
      kind:    'output',
      id:      'model',
      version: 1,
      fields:  {
        name:    { type: 'string' },
        options: { type: 'array', items: { type: 'object', fields: { code: { type: 'string' }, content: { type: 'string' }, label: { type: 'string' }, own: { type: 'string' } } } },
      },
    })
    const input: InputRecipe = parseInputRecipe({
      kind:    'input',
      id:      'configurator',
      output:  'model',
      mode:    'api',
      start:   [{ url: 'http://x' }],
      steps:   [{ type: 'emit' }],
      mapping: {
        name:    { from: 'model_name' },
        options: {
          each:   'option_rows',
          fields: {
            code:    { from: 'code' },
            content: { from: 'code', transform: [{ op: 'lookup', in: 'componentsInfo', key: 'id', pick: 'text' }] },
            label:   { from: 'code', transform: [{ op: 'template', value: '{{model_name}} {{code}}' }] },
            own:     { from: 'code', transform: [{ op: 'lookup', in: 'table', key: 'id', pick: 'text' }] },
          },
        },
      },
    })
    const snapshot = {
      model_name:     'C-Class',
      componentsInfo: [{ id: 'P31', text: 'Night package' }, { id: 'U62', text: 'Heated seats' }],
      table:          [{ id: 'P31', text: 'outer' }],
      option_rows:    [{ code: 'P31', table: [{ id: 'P31', text: 'the item\'s own' }] }, { code: 'U62' }, { code: 'X00' }],
    }
    const record = await mapRecord({ snapshot, input, output: options, hooks, url: 'http://x' })
    expect(record.data.options).toEqual([
      { code: 'P31', content: 'Night package', label: 'C-Class P31', own: 'the item\'s own' },
      // U62 has no table of its own, so `own` looks in the record's table, which has no U62.
      { code: 'U62', content: 'Heated seats', label: 'C-Class U62' },
      { code: 'X00', label: 'C-Class X00' },
    ])
  })
})
