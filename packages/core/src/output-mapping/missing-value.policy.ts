import type { FieldSpec, MappingRule, MissingPolicy, OutputRecipe } from '../recipe-schema'

/** Whether a mapped value counts as missing. An empty list is a value. */
export function isMissing (value: unknown): boolean {
  return [undefined, null, ''].includes(value as null)
}

/**
 * The policy for a missing value: mapping rule, then field, then recipe, then
 * `default` when the field has one, `fail` when it is required, `null` otherwise.
 *
 * @param field - The output field.
 * @param recipe - The output recipe.
 * @param rule - The mapping rule that produced the value, if any.
 * @returns The policy to apply.
 */
export function resolveMissingPolicy (field: FieldSpec, recipe: OutputRecipe, rule?: MappingRule): MissingPolicy {
  if (rule?.onMissing !== undefined) return rule.onMissing
  if (field.onMissing !== undefined) return field.onMissing
  if (field.default !== undefined) return 'default'
  if (recipe.onMissing !== undefined) return recipe.onMissing

  return field.required === true ? 'fail' : 'null'
}
