import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

/** Decoded recipe files, split by their `kind`. */
export interface RecipeFiles {
  outputs: { path: string, recipe: unknown }[]
  inputs:  { path: string, recipe: unknown }[]
  /** JSON files that are neither; listed so a typo in `kind` does not pass silently. */
  others:  string[]
}

/**
 * Reads recipe files, expanding directories to their `.json` files (sorted, not
 * recursive), and sorts them by `kind`.
 *
 * @param paths - Files or directories.
 * @returns The decoded files.
 * @throws Error naming a file that is not JSON.
 */
export async function readRecipeFiles (paths: readonly string[]): Promise<RecipeFiles> {
  const files = await expand(paths)
  const result: RecipeFiles = { outputs: [], inputs: [], others: [] }
  for (const path of files) {
    const recipe = await readJson(path)
    const kind = (recipe as { kind?: unknown } | null)?.kind
    if (kind === 'output') result.outputs.push({ path, recipe })
    else if (kind === 'input') result.inputs.push({ path, recipe })
    else result.others.push(path)
  }

  return result
}

async function expand (paths: readonly string[]): Promise<string[]> {
  const files: string[] = []
  for (const path of paths) {
    const target = resolve(path)
    const info = await stat(target)
    if (info.isDirectory()) {
      const entries = await readdir(target)
      const names = entries.filter(name => extname(name) === '.json').sort((a, b) => a.localeCompare(b))
      files.push(...names.map(name => join(target, name)))
    } else {
      files.push(target)
    }
  }

  return files
}

async function readJson (path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`${path}: not JSON (${(error as Error).message})`, { cause: error })
  }
}
