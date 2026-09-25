import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Hook, HookMap } from '@opencraw/core'

/**
 * Loads the hooks a recipe's `hook` steps and transforms call, from a
 * JavaScript module: its default export when that is an object of functions
 * (`export default { positive: v => v > 0 }`), else its named function exports
 * (`export function positive (v) { ... }`).
 *
 * The module runs with the caller's privileges, like any code the caller
 * imports: point this only at a file you trust.
 *
 * @param path - A `.mjs` / `.js` / `.cjs` file.
 * @param importModule - How to import it; `import()` unless a test says otherwise.
 * @returns The hooks by name.
 * @throws Error naming the file when it cannot be imported, exports no hooks,
 * or exports something under a hook's name that is not a function.
 */
export async function loadHooks (path: string, importModule: ModuleImporter = importByUrl): Promise<HookMap> {
  const url = pathToFileURL(resolve(path)).href
  let exported: Record<string, unknown>
  try {
    exported = await importModule(url)
  } catch (error) {
    throw new Error(`${path}: cannot load hooks (${(error as Error).message})`, { cause: error })
  }
  const candidates = hookExports(exported)
  const entries = Object.entries(candidates)
  if (entries.length === 0) throw new Error(`${path}: exports no hooks (export default { name: function } or named functions)`)
  const hooks: HookMap = {}
  for (const [name, value] of entries) {
    if (typeof value !== 'function') throw new Error(`${path}: hook "${name}" is ${value === null ? 'null' : typeof value}, not a function`)
    hooks[name] = value as Hook
  }

  return hooks
}

/** Imports a module by URL, returning its namespace. */
export type ModuleImporter = (url: string) => Promise<Record<string, unknown>>

async function importByUrl (url: string): Promise<Record<string, unknown>> {
  return await import(url) as Record<string, unknown>
}

function hookExports (exported: Record<string, unknown>): Record<string, unknown> {
  const fallback = exported.default
  if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) return fallback as Record<string, unknown>
  const named = Object.entries(exported).filter(([name]) => name !== 'default' && name !== 'module.exports')

  return Object.fromEntries(named)
}
