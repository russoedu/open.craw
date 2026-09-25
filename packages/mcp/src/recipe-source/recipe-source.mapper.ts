import type { RecipeSource } from '@opencraw/core'
import { z } from 'zod'

const recipeObject = z.record(z.string(), z.unknown())
const recipeObjects = z.array(recipeObject).min(1)

/** The two ways a tool takes recipes: files, or the recipes themselves. */
export const recipeSourceShape = {
  paths:   z.array(z.string()).min(1).optional().describe('Recipe files or directories (every .json and .jsonl file in a directory is read). Give this or "recipes".'),
  recipes: z.union([z.string(), recipeObjects]).optional().describe('The recipes themselves instead of files: an array of recipe objects, or JSON / JSON Lines text (one recipe per line). For a host that cannot write files. Give this or "paths".'),
}

/** A tool's recipe arguments. */
export interface RecipeSourceArgs {
  paths?:   string[]
  recipes?: string | Record<string, unknown>[]
}

/**
 * The recipe source a tool call names.
 *
 * @param args - The tool's parsed input.
 * @returns What core reads: the paths, or the inline recipes.
 * @throws Error when the call gives both or neither.
 */
export function recipeSourceOf (args: RecipeSourceArgs): RecipeSource {
  if ((args.paths === undefined) === (args.recipes === undefined)) throw new Error('give exactly one of "paths" or "recipes"')
  if (args.paths !== undefined) return args.paths

  // Inline text is always recipes, never a path, whatever it starts with.
  return typeof args.recipes === 'string' ? Buffer.from(args.recipes) : args.recipes ?? []
}
