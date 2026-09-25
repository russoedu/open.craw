import { loadHooks } from './load-hooks.repository'
import type { ModuleImporter } from './load-hooks.repository'

const context = { recipeId: 'r', scope: {}, log: (): void => {} }

function importing (namespace: Record<string, unknown>): ModuleImporter {
  return async () => namespace
}

describe('loadHooks', () => {
  it('reads a default export object of functions', async () => {
    const hooks = await loadHooks('hooks.mjs', importing({ default: { positive: (value: unknown) => Number(value) > 0, shout: (value: unknown) => String(value).toUpperCase() } }))
    expect(Object.keys(hooks)).toEqual(['positive', 'shout'])
    expect(hooks.shout('a', {}, context)).toBe('A')
  })

  it('falls back to named function exports', async () => {
    const hooks = await loadHooks('hooks.mjs', importing({ positive: (value: unknown) => Number(value) > 0 }))
    expect(hooks.positive(2, {}, context)).toBe(true)
  })

  it('imports the file by its absolute file URL', async () => {
    let seen = ''
    await loadHooks('some/hooks.mjs', async (url) => {
      seen = url

      return { positive: () => true }
    })
    expect(seen).toMatch(/^file:\/\/.*\/some\/hooks\.mjs$/)
  })

  it('names the file and what is wrong with it', async () => {
    await expect(loadHooks('bad.mjs', importing({ default: { positive: 'nope' } }))).rejects.toThrow('bad.mjs: hook "positive" is string, not a function')
    await expect(loadHooks('empty.mjs', importing({}))).rejects.toThrow('empty.mjs: exports no hooks')
    await expect(loadHooks('broken.mjs', async () => { throw new Error('SyntaxError: x') })).rejects.toThrow('broken.mjs: cannot load hooks (SyntaxError: x)')
  })
})
