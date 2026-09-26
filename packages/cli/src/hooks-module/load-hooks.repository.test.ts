import { loadHooks, loadPlugins } from './load-hooks.repository'
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

function lease (): object {
  return { proxy: { server: 'http://proxy:8080' } }
}

describe('loadPlugins', () => {
  it('reads the named hooks and accessPlugins of a plugins module', async () => {
    const plugins = await loadPlugins('plugins.mjs', importing({ hooks: { positive: () => true }, accessPlugins: [{ name: 'rotating', lease }] }))
    expect(Object.keys(plugins.hooks)).toEqual(['positive'])
    expect(plugins.accessPlugins.map(plugin => plugin.name)).toEqual(['rotating'])
  })

  it('takes a plugins module with plugins and no hooks, and a bare hooks module as before', async () => {
    expect(await loadPlugins('p.mjs', importing({ accessPlugins: [{ name: 'a', lease }] }))).toMatchObject({ hooks: {}, accessPlugins: [{ name: 'a' }] })
    expect(await loadPlugins('h.mjs', importing({ default: { positive: () => true } }))).toMatchObject({ hooks: { positive: expect.any(Function) }, accessPlugins: [] })
    expect(await loadPlugins('c.mjs', importing({ captchaSolvers: [{ name: 'fake', solve: () => ({ status: 'solved' }) }] }))).toMatchObject({ hooks: {}, accessPlugins: [], captchaSolvers: [{ name: 'fake' }] })
  })

  it('says what is wrong with a plugin', async () => {
    await expect(loadPlugins('p.mjs', importing({ accessPlugins: { name: 'a', lease } }))).rejects.toThrow('p.mjs: "accessPlugins" must be an array of { name, lease }')
    await expect(loadPlugins('p.mjs', importing({ accessPlugins: [{ name: 'a' }] }))).rejects.toThrow('p.mjs: accessPlugins[0] must be { name: string, lease: function }')
    await expect(loadPlugins('p.mjs', importing({ accessPlugins: [{ name: 'a', lease }, { name: 'a', lease }] }))).rejects.toThrow('p.mjs: accessPlugins names "a" twice')
    await expect(loadPlugins('p.mjs', importing({ captchaSolvers: [{ name: 'a', lease }] }))).rejects.toThrow('p.mjs: captchaSolvers[0] must be { name: string, solve: function }')
    await expect(loadPlugins('p.mjs', importing({ hooks: [() => true] }))).rejects.toThrow('p.mjs: "hooks" must be an object of functions')
  })
})
