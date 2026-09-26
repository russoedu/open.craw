import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RecipeValidationError } from './recipe-validation.error'
import { parseInputRecipe, parseOutputRecipe, recipeKindOf } from './recipe.validator'

function pdfRecipe (step: Record<string, unknown>): unknown {
  return { kind: 'input', id: 'x', output: 'y', mode: 'api', start: [{ url: 'http://a' }], steps: [{ type: 'request', url: 'http://a', as: 'pdf' }, step], mapping: {} }
}

function request (step: Record<string, unknown>): unknown {
  return { kind: 'input', id: 'x', output: 'y', mode: 'api', start: [{ url: 'http://a' }], steps: [{ type: 'request', url: 'http://a', ...step }], mapping: {} }
}

function fixture (name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))
}

describe('parseOutputRecipe', () => {
  it('accepts the product output recipe', () => {
    const recipe = parseOutputRecipe(fixture('product.output.json'))
    expect(recipe.id).toBe('product')
    expect(recipe.fields.variants.items?.fields?.price.currency).toBe('EUR')
  })

  it('lists every problem with its path', () => {
    const bad = { kind: 'output', id: 'Bad Id', version: 0, fields: { size: { type: 'enum' }, tags: { type: 'array' }, extra: { type: 'string', requried: true } } }
    expect(() => parseOutputRecipe(bad, 'bad.json')).toThrow(RecipeValidationError)
    try {
      parseOutputRecipe(bad, 'bad.json')
    } catch (error) {
      const issues = (error as RecipeValidationError).issues
      const paths = issues.map(issue => issue.path)
      expect(paths).toEqual(expect.arrayContaining(['id', 'version', 'fields.size.values', 'fields.tags.items', 'fields.extra']))
      expect((error as Error).message).toContain('bad.json')
    }
  })

  it('rejects a generated field marked required', () => {
    const bad = { kind: 'output', id: 'x', version: 1, fields: { at: { type: 'datetime', generated: 'now', required: true } } }
    expect(() => parseOutputRecipe(bad)).toThrow(/generated field/)
  })

  it('takes a json field with no shape, and refuses one given a shape', () => {
    expect(parseOutputRecipe({ kind: 'output', id: 'raw', version: 1, fields: { payload: { type: 'json', required: true } } }).fields.payload.type).toBe('json')
    expect(() => parseOutputRecipe({ kind: 'output', id: 'raw', version: 1, fields: { payload: { type: 'json', fields: { a: { type: 'string' } } } } })).toThrow(/takes no "fields" or "items"/)
  })
})

const recipe = (steps: unknown[]): unknown => ({ kind: 'input', id: 'r', output: 'o', mode: 'web', start: [{ url: 'http://x' }], steps, mapping: {} })

describe('parseInputRecipe', () => {
  it('accepts the web and api input recipes', () => {
    const web = parseInputRecipe(fixture('shop-web.input.json'))
    const api = parseInputRecipe(fixture('shop-api.input.json'))
    expect(web.mode).toBe('web')
    expect(api.session?.bootstrap?.keep).toEqual(['cookies'])
    expect(web.steps[1].type).toBe('paginate')
  })

  it('rejects an unknown step type and an unknown transform op', () => {
    const bad = {
      kind:    'input',
      id:      'x',
      output:  'y',
      mode:    'api',
      start:   [{ url: 'http://a' }],
      steps:   [{ type: 'teleport' }],
      mapping: { a: { from: 'b', transform: [{ op: 'explode' }] } },
    }
    try {
      parseInputRecipe(bad)
      throw new Error('expected a RecipeValidationError')
    } catch (error) {
      const paths = (error as RecipeValidationError).issues.map(issue => issue.path)
      expect(paths).toEqual(expect.arrayContaining(['steps.0.type', 'mapping.a.transform.0.op']))
    }
  })

  it('takes table options on a table extract only', () => {
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: '^MODELS', kind: 'table', columns: { model: '^MODELS' }, until: '^NOTE', align: 'center' }))).not.toThrow()
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: 'h1', kind: 'css', columns: { model: 'x' } }))).toThrow(/"columns" belongs to kind "table"/)
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: 'x', kind: 'table', align: 'middle' }))).toThrow(/align/)
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: '^Marke', kind: 'table', sheet: '^FZ', headerRows: 2, fillDown: ['brand'], includeHidden: true }))).not.toThrow()
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: 'h1', kind: 'css', headerRows: 2 }))).toThrow(/"headerRows" belongs to kind "table"/)
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: '^Modello', kind: 'table', slide: '^Incentivi', shapes: true }))).not.toThrow()
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: 'x', kind: 'regex', shapes: true }))).toThrow(/"shapes" belongs to kind "table"/)
    expect(() => parseInputRecipe(pdfRecipe({ type: 'extract', id: 't', selector: 'x', kind: 'table', headerRows: 0 }))).toThrow(/headerRows/)
  })

  it('takes a delimiter on a request read as CSV, and an encoding on any request', () => {
    expect(() => parseInputRecipe(request({ as: 'csv', delimiter: ';', encoding: 'windows-1252' }))).not.toThrow()
    expect(() => parseInputRecipe(request({ delimiter: ';' }))).not.toThrow()
    expect(() => parseInputRecipe(request({ as: 'json', encoding: 'utf8' }))).not.toThrow()
    expect(() => parseInputRecipe(request({ as: 'json', delimiter: ';' }))).toThrow(/"delimiter" reads CSV only/)
    expect(() => parseInputRecipe(request({ as: 'csv', delimiter: ';;' }))).toThrow(/delimiter/)
    expect(() => parseInputRecipe(request({ as: 'yaml', scalars: 'text' }))).not.toThrow()
    expect(() => parseInputRecipe(request({ as: 'json', scalars: 'text' }))).toThrow(/"scalars" reads YAML only/)
  })

  it('rejects unknown keys (typos) anywhere', () => {
    const bad = {
      kind:    'input',
      id:      'x',
      output:  'y',
      mode:    'web',
      start:   [{ url: 'http://a' }],
      steps:   [{ type: 'goto', url: 'http://a', waitFor: 'load' }],
      mapping: {},
    }
    expect(() => parseInputRecipe(bad)).toThrow(/steps.0/)
  })

  it('validates nested steps inside forEach and paginate', () => {
    const bad = {
      kind:    'input',
      id:      'x',
      output:  'y',
      mode:    'web',
      start:   [{ url: 'http://a' }],
      steps:   [{ type: 'paginate', next: { selector: 'a' }, steps: [{ type: 'forEach', over: 'l', as: 'i', steps: [{ type: 'extract', selector: 'h1' }] }] }],
      mapping: {},
    }
    try {
      parseInputRecipe(bad)
      throw new Error('expected a RecipeValidationError')
    } catch (error) {
      const paths = (error as RecipeValidationError).issues.map(issue => issue.path)
      expect(paths).toContain('steps.0.steps.0.steps.0.kind')
    }
  })
})

describe('recipeKindOf', () => {
  it('reads the kind without validating', () => {
    expect(recipeKindOf({ kind: 'input' })).toBe('input')
    expect(recipeKindOf({ kind: 'output', broken: true })).toBe('output')
    expect(recipeKindOf({ kind: 'other' })).toBeUndefined()
    expect(recipeKindOf('text')).toBeUndefined()
  })

  it('requires exactly one of over and selector on forEach, and one target on interactions', () => {
    const both = () => parseInputRecipe(recipe([{ type: 'forEach', over: 'a', selector: 'option', as: 'o', steps: [] }]))
    expect(both).toThrow('give exactly one of over (a list id) or selector (live elements)')
    const neither = () => parseInputRecipe(recipe([{ type: 'forEach', as: 'o', steps: [] }]))
    expect(neither).toThrow('give exactly one of over')
    expect(() => parseInputRecipe(recipe([{ type: 'click' }]))).toThrow('give exactly one of selector or target')
    expect(() => parseInputRecipe(recipe([{ type: 'select', target: '{{o}}' }]))).toThrow('give exactly one of value, label, index or values')
    expect(() => parseInputRecipe(recipe([{ type: 'select', target: '{{o}}', value: '1', index: 1 }]))).toThrow('give exactly one of value, label, index or values')
    const ok = parseInputRecipe(recipe([
      { type: 'forEach', selector: 'select#trim option', as: 'o', emit: true, steps: [{ type: 'select', selector: 'select#trim', value: '{{o.attrs.value}}' }, { type: 'click', target: '{{o}}' }, { type: 'press', key: 'Enter' }] },
    ]))
    expect(ok.steps[0].type).toBe('forEach')
  })

  it('refuses a placeholder in a plain selector, which is never rendered, and points to target', () => {
    for (const step of [{ type: 'click', selector: '#item-{{id}}' }, { type: 'fill', selector: '#{{field}}', value: 'x' }, { type: 'wait', selector: '[data-id="{{id}}"]' }]) {
      expect(() => parseInputRecipe(recipe([step]))).toThrow('a selector is not a template: put a selector with placeholders in "target"')
    }
    expect(parseInputRecipe(recipe([{ type: 'click', target: '#item-{{id}}' }])).steps[0]).toMatchObject({ target: '#item-{{id}}' })
  })

  it('takes a form captcha step, which needs the element that shows once accepted', () => {
    const form = { type: 'captcha', solver: 'reader', image: '#captchaImage', refresh: '#captchaImg', field: '#externalCaptcha', submit: [{ type: 'click', selector: '#applyTrigger' }], verify: { selector: '#report', failure: '#captchaMsg', timeoutMs: 30_000 } }
    expect(parseInputRecipe(recipe([form])).steps[0]).toMatchObject({ image: '#captchaImage', submit: [{ type: 'click' }] })
    expect(() => parseInputRecipe(recipe([{ ...form, verify: { failure: '#captchaMsg' } }]))).toThrow('a form captcha (image or submit) needs verify.selector')
    expect(() => parseInputRecipe(recipe([{ ...form, selector: '.g-recaptcha' }]))).toThrow('give image (a form captcha) or selector (a widget), not both')
    expect(() => parseInputRecipe(recipe([{ ...form, submit: [{ type: 'goto', url: 'x' }] }]))).toThrow()
  })

  it('takes several select values with force, and a click that downloads', () => {
    const parsed = parseInputRecipe(recipe([
      { type: 'select', selector: '#state', values: ['{{ split(vars.states) }}'], force: true, multiple: true, ignoreCase: true, timeoutMs: 20_000 },
      { type: 'click', selector: '#export', id: 'file', download: { as: 'xlsx', saveTo: 'out/{{vars.name}}.xlsx', timeoutMs: 60_000 } },
    ]))
    expect(parsed.steps).toMatchObject([{ values: ['{{ split(vars.states) }}'], force: true }, { download: { as: 'xlsx' } }])
    expect(() => parseInputRecipe(recipe([{ type: 'select', selector: '#s', value: 'a', values: ['b'] }]))).toThrow('give exactly one of value, label, index or values')
    expect(() => parseInputRecipe(recipe([{ type: 'click', selector: '#x', download: { as: 'exe' } }]))).toThrow()
  })

  it('takes a request body from a form, but not with a body as well', () => {
    const request = { type: 'request', url: '/rows', method: 'POST', form: { selector: '#reportForm', omit: ['captcha'], set: { pageSize: '25' } } }
    expect(parseInputRecipe(recipe([request])).steps[0]).toMatchObject({ form: { selector: '#reportForm', set: { pageSize: '25' } } })
    expect(() => parseInputRecipe(recipe([{ ...request, body: { a: 1 } }]))).toThrow('give body or form, not both')
  })

  it('takes a goto ready element, a wait timeout and evaluate args', () => {
    const parsed = parseInputRecipe(recipe([
      { type: 'goto', url: '{{start.url}}', ready: { selector: '#yAxis', timeoutMs: 20_000, reloads: 3 } },
      { type: 'wait', selector: '#report', timeoutMs: 600_000 },
      { type: 'evaluate', id: 'x', script: '(a) => a.state', args: { state: '{{vars.state}}', codes: ['{{vars.code}}'] } },
    ]))
    expect(parsed.steps).toMatchObject([{ ready: { selector: '#yAxis', reloads: 3 } }, { timeoutMs: 600_000 }, { args: { state: '{{vars.state}}' } }])
    expect(() => parseInputRecipe(recipe([{ type: 'goto', url: 'x', ready: { selector: '#{{id}}' } }]))).toThrow('a selector is not a template')
  })
})
