import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** A decoded recipe file, before validation. */
export interface RecipeFile {
  path:    string
  content: unknown
}

/**
 * Reads one `.json` file, or every `.json` file directly inside a directory.
 *
 * @param location - A file or directory path.
 * @returns The decoded files, sorted by path.
 * @throws When a file is not valid JSON.
 */
export async function readRecipeFiles (location: string): Promise<RecipeFile[]> {
  const absolute = resolve(location)
  const info = await stat(absolute)
  const paths = info.isDirectory() ? await jsonFilesIn(absolute) : [absolute]

  return Promise.all(paths.map(async path => ({ path, content: await readJson(path) })))
}

async function jsonFilesIn (directory: string): Promise<string[]> {
  const names = await readdir(directory)

  return names.filter(name => name.endsWith('.json')).sort((a, b) => a.localeCompare(b)).map(name => join(directory, name))
}

async function readJson (path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${path}: not valid JSON (${(error as Error).message})`, { cause: error })
  }
}
