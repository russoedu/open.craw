import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AccessPlugin, Hook, HookMap } from '@opencraw/core'

/** What a plugins module provides: hooks for `hook` steps and transforms, and plugins the engine calls. */
export interface PluginModule {
  hooks:         HookMap
  /** Access plugins: `{ kind: "plugin", name }` profiles in the access config use them. */
  accessPlugins: AccessPlugin[]
}

/** The named exports that mark a module as a plugins module rather than a bare hooks module. */
const PLUGIN_EXPORTS = ['hooks', 'accessPlugins'] as const

/**
 * Loads a plugins module: a JavaScript module whose named exports `hooks`
 * (`{ name: function }`) and `accessPlugins` (`[{ name, lease }]`) give what
 * recipes and access profiles refer to by name:
 *
 * ```js
 * export const hooks = { positive: v => v > 0 }
 * export const accessPlugins = [{ name: 'browserbase', lease: async () => ({ cdp: { endpoint } }) }]
 * ```
 *
 * A module with none of those names is a bare hooks module, as before: its
 * default export when that is an object of functions, else its named function
 * exports.
 *
 * The module runs with the caller's privileges, like any code the caller
 * imports: point this only at a file you trust.
 *
 * @param path - A `.mjs` / `.js` / `.cjs` file.
 * @param importModule - How to import it; `import()` unless a test says otherwise.
 * @returns The hooks and plugins.
 * @throws Error naming the file when it cannot be imported, provides nothing,
 * or provides something that is not what its name promises.
 */
export async function loadPlugins (path: string, importModule: ModuleImporter = importByUrl): Promise<PluginModule> {
  const url = pathToFileURL(resolve(path)).href
  let exported: Record<string, unknown>
  try {
    exported = await importModule(url)
  } catch (error) {
    throw new Error(`${path}: cannot load hooks (${(error as Error).message})`, { cause: error })
  }
  if (PLUGIN_EXPORTS.every(name => !Object.hasOwn(exported, name))) {
    const hooks = hooksOf(hookExports(exported), path)
    if (Object.keys(hooks).length === 0) throw new Error(`${path}: exports no hooks (export default { name: function } or named functions) and no plugins (export const hooks, accessPlugins)`)

    return { hooks, accessPlugins: [] }
  }

  return {
    hooks:         hooksOf(objectExport(exported.hooks, 'hooks', path), path),
    accessPlugins: pluginsOf(exported.accessPlugins, 'accessPlugins', 'lease', path) as AccessPlugin[],
  }
}

/**
 * Loads the hooks of a hooks or plugins module (see {@link loadPlugins}).
 *
 * @param path - A `.mjs` / `.js` / `.cjs` file.
 * @param importModule - How to import it.
 * @returns The hooks by name.
 * @throws Error naming the file when it cannot be imported or exports no hooks.
 */
export async function loadHooks (path: string, importModule: ModuleImporter = importByUrl): Promise<HookMap> {
  const { hooks } = await loadPlugins(path, importModule)
  if (Object.keys(hooks).length === 0) throw new Error(`${path}: exports no hooks (export default { name: function } or named functions)`)

  return hooks
}

function hooksOf (candidates: Record<string, unknown>, path: string): HookMap {
  const hooks: HookMap = {}
  for (const [name, value] of Object.entries(candidates)) {
    if (typeof value !== 'function') throw new Error(`${path}: hook "${name}" is ${value === null ? 'null' : typeof value}, not a function`)
    hooks[name] = value as Hook
  }

  return hooks
}

function objectExport (value: unknown, name: string, path: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path}: "${name}" must be an object of functions`)

  return value as Record<string, unknown>
}

/** A list of `{ name, <method> }` plugins, checked. */
function pluginsOf (value: unknown, exportName: string, method: string, path: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${path}: "${exportName}" must be an array of { name, ${method} }`)
  const names = new Set<string>()
  for (const [index, plugin] of value.entries()) {
    const entry = plugin as Record<string, unknown> | null
    if (typeof entry?.name !== 'string' || entry.name === '' || typeof entry[method] !== 'function') throw new Error(`${path}: ${exportName}[${index}] must be { name: string, ${method}: function }`)
    if (names.has(entry.name)) throw new Error(`${path}: ${exportName} names "${entry.name}" twice`)
    names.add(entry.name)
  }

  return value
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
