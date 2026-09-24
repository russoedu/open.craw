import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RecipeValidationError } from '../recipe-schema'
import { bindRecipeSet, loadRecipeSet } from './load-recipe-set.use-case'
import { RecipeBindingError } from './recipe-binding.error'

const fixtures = join(__dirname, '..', 'recipe-schema', 'fixtures')

describe('loadRecipeSet', () => {
  it('loads an output file and input files in the order given', async () => {
    const set = await loadRecipeSet({ output: join(fixtures, 'product.output.json'), inputs: [join(fixtures, 'shop-api.input.json'), join(fixtures, 'shop-web.input.json')] })
    expect(set.output.id).toBe('product')
    expect(set.inputs.map(input => input.id)).toEqual(['shop-api', 'shop-web'])
  })

  it('loads a directory, picking the output recipe by kind', async () => {
    const set = await loadRecipeSet({ output: fixtures, inputs: [fixtures] })
    expect(set.output.id).toBe('product')
    expect(set.inputs.map(input => input.id)).toEqual(['shop-api', 'shop-web'])
  })

  it('accepts already-decoded recipes', async () => {
    const output = { kind: 'output', id: 'o', version: 1, fields: { a: { type: 'string' } } }
    const input = { kind: 'input', id: 'i', output: 'o', mode: 'api', start: [{ url: 'http://x' }], steps: [{ type: 'request', id: 'r', url: '{{start.url}}' }, { type: 'emit' }], mapping: { a: { from: 'r' } } }
    const set = await loadRecipeSet({ output, inputs: [input] })
    expect(set.inputs).toHaveLength(1)
  })

  it('reports invalid JSON with the file path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recipes-'))
    const path = join(directory, 'broken.json')
    await writeFile(path, '{ not json')
    await expect(loadRecipeSet({ output: path, inputs: [] })).rejects.toThrow(/broken\.json: not valid JSON/)
  })

  it('fails validation before binding', async () => {
    await expect(loadRecipeSet({ output: { kind: 'output', id: 'o', version: 1, fields: {} }, inputs: [{ kind: 'input' }] })).rejects.toThrow(RecipeValidationError)
  })
})

describe('bindRecipeSet', () => {
  it('rejects an input that names another output', () => {
    const output = { kind: 'output' as const, id: 'o', version: 1, fields: {} }
    const input = { kind: 'input' as const, id: 'i', output: 'other', mode: 'api' as const, start: [{ url: 'x' }], steps: [{ type: 'emit' as const }], mapping: {} }
    expect(() => bindRecipeSet(output, [input])).toThrow(/target output "other"/)
  })

  it('throws a RecipeBindingError listing every issue', () => {
    const output = { kind: 'output' as const, id: 'o', version: 1, fields: { a: { type: 'string' as const, required: true } } }
    const input = { kind: 'input' as const, id: 'i', output: 'o', mode: 'api' as const, start: [{ url: 'x' }], steps: [{ type: 'emit' as const }], mapping: { b: { from: 'nothing' } } }
    expect(() => bindRecipeSet(output, [input])).toThrow(RecipeBindingError)
  })
})
