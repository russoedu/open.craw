import { parseInputRecipe, parseOutputRecipe, recipeKindOf } from '../recipe-schema'
import type { InputRecipe, OutputRecipe } from '../recipe-schema'
import { RecipeBindingError } from './recipe-binding.error'
import { validateBinding } from './recipe-binding.validator'
import { readRecipeFiles } from './recipe-file.repository'
import { RecipeSet } from './recipe-set.model'

/** What to load: file or directory paths, or already-decoded recipes. */
export interface RecipeSetSource {
  /** The output recipe file (or its decoded JSON). */
  output: string | unknown
  /** Input recipe files or directories of them (or decoded JSON). */
  inputs: readonly (string | unknown)[]
}

/**
 * Loads, validates and binds one output recipe with its input recipes.
 *
 * @param source - Where the recipes are.
 * @returns A bound set, inputs in the order given.
 * @throws RecipeValidationError when a file does not match its contract.
 * @throws RecipeBindingError when an input cannot feed the output.
 */
export async function loadRecipeSet (source: RecipeSetSource): Promise<RecipeSet> {
  const output = await loadOutput(source.output)
  const inputs: InputRecipe[] = []
  for (const input of source.inputs) inputs.push(...await loadInputs(input))

  return bindRecipeSet(output, inputs)
}

/**
 * Binds already-parsed recipes into a set.
 *
 * @param output - The output recipe.
 * @param inputs - The input recipes.
 * @returns A bound set.
 * @throws RecipeBindingError when an input cannot feed the output.
 */
export function bindRecipeSet (output: OutputRecipe, inputs: readonly InputRecipe[]): RecipeSet {
  const set = new RecipeSet(output, inputs)
  const issues = inputs.flatMap(input => validateBinding(input, output))
  if (issues.length > 0) throw new RecipeBindingError(issues)

  return set
}

async function loadOutput (source: string | unknown): Promise<OutputRecipe> {
  if (typeof source !== 'string') return parseOutputRecipe(source)
  const files = await readRecipeFiles(source)
  const outputs = files.filter(file => recipeKindOf(file.content) === 'output')
  if (outputs.length !== 1) throw new Error(`${source}: expected exactly one output recipe, found ${outputs.length}`)

  return parseOutputRecipe(outputs[0].content, outputs[0].path)
}

async function loadInputs (source: string | unknown): Promise<InputRecipe[]> {
  if (typeof source !== 'string') return [parseInputRecipe(source)]
  const files = await readRecipeFiles(source)

  return files.filter(file => recipeKindOf(file.content) !== 'output').map(file => parseInputRecipe(file.content, file.path))
}
