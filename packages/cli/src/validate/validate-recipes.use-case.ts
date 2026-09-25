import { RecipeBindingError, RecipeValidationError, bindRecipeSet, parseInputRecipe, parseOutputRecipe } from '@open.craw/core'
import { readRecipeFiles } from '../recipe-files'
import type { Terminal } from '../terminal'

/**
 * Loads and binds recipe files, printing every problem with its JSON path.
 *
 * @param paths - Recipe files or directories.
 * @param terminal - Where results go.
 * @returns The exit code: 0 when the recipes bind cleanly, 1 otherwise.
 */
export async function validateRecipes (paths: readonly string[], terminal: Terminal): Promise<number> {
  const files = await readRecipeFiles(paths)
  for (const path of files.others) terminal.err(`${path}: not a recipe ("kind" is missing or not "input"/"output")`)
  if (files.outputs.length === 0) {
    terminal.err('no output recipe found')

    return 1
  }
  if (files.outputs.length > 1) {
    terminal.err(`more than one output recipe: ${files.outputs.map(file => file.path).join(', ')}`)

    return 1
  }
  let ok = true
  const output = parseOne(files.outputs[0].path, files.outputs[0].recipe, parseOutputRecipe, terminal)
  const inputs = files.inputs.flatMap((file) => {
    const parsed = parseOne(file.path, file.recipe, parseInputRecipe, terminal)

    return parsed === undefined ? [] : [parsed]
  })
  ok &&= output !== undefined && inputs.length === files.inputs.length
  if (output === undefined) return 1
  try {
    const set = bindRecipeSet(output, inputs)
    terminal.out(`ok: ${set.output.id} <- ${set.inputs.map(input => input.id).join(', ') || '(no inputs)'}`)
  } catch (error) {
    ok = false
    if (error instanceof RecipeBindingError) for (const issue of error.issues) terminal.err(`${issue.recipeId}: ${issue.path}: ${issue.message}`)
    else terminal.err(String(error))
  }

  return ok ? 0 : 1
}

function parseOne<T> (path: string, recipe: unknown, parse: (value: unknown, source: string) => T, terminal: Terminal): T | undefined {
  try {
    return parse(recipe, path)
  } catch (error) {
    if (error instanceof RecipeValidationError) for (const issue of error.issues) terminal.err(`${path}: ${issue.path}: ${issue.message}`)
    else terminal.err(`${path}: ${String(error)}`)

    return undefined
  }
}
