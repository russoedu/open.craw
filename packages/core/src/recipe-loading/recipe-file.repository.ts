import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import type { RecipeDocument } from './recipe-source.contract'
import { parseRecipeText } from './recipe-text.mapper'

const RECIPE_EXTENSIONS = new Set(['.json', '.jsonl'])

/**
 * Reads one recipe file, or every `.json` and `.jsonl` file directly inside a
 * directory. A file holds one recipe, an array of them, or JSON Lines.
 *
 * @param location - A file or directory path.
 * @returns The decoded recipes, files sorted by path.
 * @throws When the path does not exist or a file is neither JSON nor JSON Lines.
 */
export async function readRecipeFiles (location: string): Promise<RecipeDocument[]> {
  const absolute = resolve(location)
  const info = await stat(absolute)
  const paths = info.isDirectory() ? await recipeFilesIn(absolute) : [absolute]
  const files = await Promise.all(paths.map(async path => parseRecipeText(await readFile(path, 'utf8'), path)))

  return files.flat()
}

async function recipeFilesIn (directory: string): Promise<string[]> {
  const names = await readdir(directory)

  return names.filter(name => RECIPE_EXTENSIONS.has(extname(name))).sort((a, b) => a.localeCompare(b)).map(name => join(directory, name))
}
