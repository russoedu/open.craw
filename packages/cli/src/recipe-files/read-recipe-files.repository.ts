import { readRecipeSource } from '@opencraw/core'
import type { RecipeSource } from '@opencraw/core'

/** Decoded recipes, split by their `kind`. */
export interface RecipeFiles {
  /** `path` is the file, `path:line` in a JSON Lines file, or a label (`recipes[0]`) for one from memory. */
  outputs: { path: string, recipe: unknown }[]
  inputs:  { path: string, recipe: unknown }[]
  /** Documents that are neither; listed so a typo in `kind` does not pass silently. */
  others:  string[]
}

/**
 * Reads recipes, expanding directories to their `.json` and `.jsonl` files
 * (sorted, not recursive), and sorts them by `kind`. The command line passes
 * paths; the MCP server also passes recipes it was handed inline.
 *
 * @param sources - Files or directories, or any other recipe source core reads.
 * @returns The decoded recipes.
 * @throws Error naming a file that is not JSON or JSON Lines.
 */
export async function readRecipeFiles (sources: RecipeSource): Promise<RecipeFiles> {
  const result: RecipeFiles = { outputs: [], inputs: [], others: [] }
  const documents = await readRecipeSource(sources)
  for (const document of documents) {
    const kind = (document.content as { kind?: unknown } | null)?.kind
    if (kind === 'output') result.outputs.push({ path: document.source, recipe: document.content })
    else if (kind === 'input') result.inputs.push({ path: document.source, recipe: document.content })
    else result.others.push(document.source)
  }

  return result
}
