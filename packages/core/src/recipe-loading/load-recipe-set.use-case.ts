import { parseInputRecipe, parseOutputRecipe, recipeKindOf } from '../recipe-schema'
import type { InputRecipe, OutputRecipe } from '../recipe-schema'
import { readRecipeSource } from './read-recipe-source.use-case'
import { RecipeBindingError } from './recipe-binding.error'
import { validateBinding } from './recipe-binding.validator'
import type { RecipeDocument, RecipeSource } from './recipe-source.contract'
import { RecipeSet } from './recipe-set.model'

/** What to load, with the output recipe kept apart from the inputs. */
export interface RecipeSetSource {
  /** The output recipe, or a source holding exactly one output recipe among others. */
  output: RecipeSource
  /**
   * The input recipes. The output recipe itself is skipped when found here, so
   * one directory or bundle holding both can be passed as both.
   */
  inputs: readonly RecipeSource[]
}

/**
 * Loads, validates and binds one output recipe with its input recipes.
 *
 * @param source - Where the recipes are; each part takes any {@link RecipeSource}.
 * @returns A bound set, inputs in the order given.
 * @throws RecipeValidationError when a recipe does not match its contract.
 * @throws RecipeBindingError when an input cannot feed the output.
 */
export async function loadRecipeSet (source: RecipeSetSource): Promise<RecipeSet> {
  const output = await loadOutput(source.output)
  const inputs: InputRecipe[] = []
  for (const [index, input] of source.inputs.entries()) {
    const documents = await readRecipeSource(input, `inputs[${index}]`)
    inputs.push(...documents.filter(document => !isSameOutput(document, output)).map(document => parseInputRecipe(document.content, document.source)))
  }

  return bindRecipeSet(output, inputs)
}

/**
 * Loads, validates and binds recipes from one source holding all of them, the
 * output recipe told apart from the inputs by its `kind`: a directory, a JSON
 * Lines file or string, a `Blob` or `Buffer` of either, or an array of recipe
 * objects.
 *
 * @param source - Where the recipes are.
 * @returns A bound set, inputs in the order found.
 * @throws Error when the source does not hold exactly one output recipe.
 * @throws RecipeValidationError when a recipe does not match its contract.
 * @throws RecipeBindingError when an input cannot feed the output.
 */
export async function loadRecipes (source: RecipeSource): Promise<RecipeSet> {
  const documents = await readRecipeSource(source)
  const outputs = documents.filter(document => recipeKindOf(document.content) === 'output')
  if (outputs.length !== 1) throw new Error(`expected exactly one output recipe, found ${outputs.length}${outputs.length > 1 ? `: ${outputs.map(document => document.source).join(', ')}` : ''}`)
  const output = parseOutputRecipe(outputs[0].content, outputs[0].source)
  const inputs = documents.filter(document => document !== outputs[0]).map(document => parseInputRecipe(document.content, document.source))

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

async function loadOutput (source: RecipeSource): Promise<OutputRecipe> {
  const documents = await readRecipeSource(source, 'output')
  // One document is the output recipe, whatever it says: its own validation errors beat "found 0".
  const outputs = documents.length === 1 ? documents : documents.filter(document => recipeKindOf(document.content) === 'output')
  if (outputs.length !== 1) throw new Error(`${typeof source === 'string' ? source : 'output'}: expected exactly one output recipe, found ${outputs.length}`)

  return parseOutputRecipe(outputs[0].content, outputs[0].source)
}

function isSameOutput (document: RecipeDocument, output: OutputRecipe): boolean {
  return recipeKindOf(document.content) === 'output' && (document.content as { id?: unknown }).id === output.id
}
