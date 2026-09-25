import { bindRecipeSet, parseInputRecipe, parseOutputRecipe } from '@open.craw/core'
import type { RecipeSet } from '@open.craw/core'
import { readRecipeFiles } from '../recipe-files'

/**
 * Loads and binds the recipes `run` needs, filtered to the input ids in `only`
 * when given.
 *
 * @param paths - Recipe files or directories.
 * @param only - Input recipe ids to keep; empty keeps all.
 * @returns The bound set.
 * @throws Error when there is not exactly one output recipe.
 * @throws RecipeValidationError, RecipeBindingError on a bad recipe.
 */
export async function loadForRun (paths: readonly string[], only: readonly string[]): Promise<RecipeSet> {
  const files = await readRecipeFiles(paths)
  if (files.outputs.length !== 1) throw new Error(`expected exactly one output recipe, found ${files.outputs.length}`)
  const output = parseOutputRecipe(files.outputs[0].recipe, files.outputs[0].path)
  const inputs = files.inputs
    .map(file => parseInputRecipe(file.recipe, file.path))
    .filter(input => only.length === 0 || only.includes(input.id))

  return bindRecipeSet(output, inputs)
}
