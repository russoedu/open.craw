import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RecipeValidationError } from './recipe-validation.error'
import { parseInputRecipe, parseOutputRecipe, recipeKindOf } from './recipe.validator'

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
})

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
})
