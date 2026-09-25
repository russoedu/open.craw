import type { FieldSpec } from '../recipe-schema'

/**
 * Checks a present, coerced value against the field's quality rules.
 *
 * @param value - A non-missing coerced value.
 * @param field - The output field.
 * @returns Every violated rule, as messages; empty when valid.
 */
export function validateField (value: unknown, field: FieldSpec): string[] {
  const problems: string[] = []
  if (typeof value === 'number') {
    if (field.min !== undefined && value < field.min) problems.push(`${value} is below the minimum ${field.min}`)
    if (field.max !== undefined && value > field.max) problems.push(`${value} is above the maximum ${field.max}`)
  }
  if (typeof value === 'string') {
    if (field.minLength !== undefined && value.length < field.minLength) problems.push(`shorter than ${field.minLength} characters`)
    if (field.maxLength !== undefined && value.length > field.maxLength) problems.push(`longer than ${field.maxLength} characters`)
    if (field.pattern !== undefined && !new RegExp(field.pattern).test(value)) problems.push(`"${value}" does not match ${field.pattern}`)
  }
  if (Array.isArray(value)) {
    if (field.minLength !== undefined && value.length < field.minLength) problems.push(`fewer than ${field.minLength} items`)
    if (field.maxLength !== undefined && value.length > field.maxLength) problems.push(`more than ${field.maxLength} items`)
  }

  return problems
}
