import type { InputRecipe, OutputRecipe } from '../recipe-schema'

/**
 * One output recipe and the input recipes that feed it. The invariant that
 * every input names this output is checked on construction; deeper binding
 * rules live in the binding validator.
 */
export class RecipeSet {
  constructor (
    readonly output: OutputRecipe,
    readonly inputs: readonly InputRecipe[],
  ) {
    const strangers = inputs.filter(input => input.output !== output.id)
    if (strangers.length > 0) {
      throw new Error(`input recipe(s) ${strangers.map(input => `"${input.id}"`).join(', ')} target output "${strangers[0].output}", not "${output.id}"`)
    }
    const ids = new Set<string>()
    for (const input of inputs) {
      if (ids.has(input.id)) throw new Error(`two input recipes share the id "${input.id}"`)
      ids.add(input.id)
    }
  }
}
