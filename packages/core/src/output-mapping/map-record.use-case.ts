import type { HookRegistry } from '../hooks'
import type { FieldSpec, InputRecipe, MappingRule, OutputRecipe } from '../recipe-schema'
import { getPath, setPath } from '../template'
import { applyTransformChain } from '../transformation'
import type { TransformContext } from '../transformation'
import { coerceValue } from './coerce-field.mapper'
import { generatedValue } from './generated-field.mapper'
import { MappingFailedError, RecordRejectedError } from './mapping.error'
import { isMissing, resolveMissingPolicy } from './missing-value.policy'
import { validateField } from './output-field.validator'
import { recordKey } from './output-record.model'
import type { OutputRecord } from './output-record.model'

/** Everything needed to turn one emitted scope snapshot into a record. */
export interface MapRecordRequest {
  snapshot:   Record<string, unknown>
  input:      InputRecipe
  output:     OutputRecipe
  hooks:      HookRegistry
  /** The page URL at emit time. */
  url:        string
  emittedAt?: string
  log?:       TransformContext['log']
}

/**
 * Maps an emitted scope snapshot to a validated output record: resolves every
 * mapping rule, runs its transform chain, fills generated fields, then coerces
 * and validates each output field and applies the missing-value policy.
 *
 * @param request - The snapshot and the recipes.
 * @returns The record.
 * @throws RecordRejectedError when a field's policy is `skip-record`.
 * @throws MappingFailedError when a field's policy is `fail`, or a transform throws.
 */
export async function mapRecord (request: MapRecordRequest): Promise<OutputRecord> {
  const { snapshot, input, output } = request
  const emittedAt = request.emittedAt ?? new Date().toISOString()
  const context: TransformContext = {
    recipeId: input.id,
    scope:    snapshot,
    lookup:   path => getPath(snapshot, path),
    hooks:    request.hooks,
    baseUrl:  request.url,
    log:      request.log ?? (() => {}),
  }

  const raw: Record<string, unknown> = {}
  const rulesByTarget = new Map<string, MappingRule>()
  for (const [target, rule] of Object.entries(input.mapping)) {
    rulesByTarget.set(target, rule)
    const value = await resolveRule(rule, snapshot, snapshot, context, target)
    if (value !== undefined) setPath(raw, target, value)
  }
  for (const [name, field] of Object.entries(output.fields)) {
    if (field.generated !== undefined) raw[name] = generatedValue(field.generated, { recipeId: input.id, url: request.url, emittedAt })
  }

  const data = finishObject(raw, output.fields, output, rulesByTarget, '')
  const keyFields = Object.entries(output.fields).filter(([, field]) => field.key === true).map(([name]) => name)

  return { data, key: recordKey(data, keyFields), source: { recipeId: input.id, url: request.url, emittedAt } }
}

async function resolveRule (rule: MappingRule, scope: Record<string, unknown>, self: unknown, context: TransformContext, target: string): Promise<unknown> {
  try {
    if ('each' in rule) return await resolveEach(rule, scope, context, target)
    const sources = Array.isArray(rule.from) ? rule.from : [rule.from]
    const values = sources.map(source => (source === '.' ? self : getPath(scope, source)))
    const value = Array.isArray(rule.from) ? values : values[0]

    return await applyTransformChain(value, rule.transform ?? [], context)
  } catch (error) {
    if (error instanceof MappingFailedError || error instanceof RecordRejectedError) throw error
    // A rule that says skip-record means "this record is not worth keeping without
    // this field": a transform that cannot produce it drops the record, not the recipe.
    if (rule.onMissing === 'skip-record') throw new RecordRejectedError(target, (error as Error).message)
    throw new MappingFailedError(target, (error as Error).message, { cause: error })
  }
}

async function resolveEach (rule: Extract<MappingRule, { each: string }>, scope: Record<string, unknown>, context: TransformContext, target: string): Promise<unknown[] | undefined> {
  const list = getPath(scope, rule.each)
  if (list === undefined || list === null) return undefined
  if (!Array.isArray(list)) throw new MappingFailedError(target, `"${rule.each}" is not a list`)
  const items: unknown[] = []
  for (const item of list) {
    const itemScope = itemAsScope(item)
    const built: Record<string, unknown> = {}
    const nestedRules = Object.entries(rule.fields)
    for (const [name, nested] of nestedRules) {
      const value = await resolveRule(nested, itemScope, item, { ...context, scope: itemScope, lookup: itemLookup(itemScope, context.lookup) }, `${target}.${name}`)
      if (value !== undefined) setPath(built, name, value)
    }
    items.push(built)
  }

  return items
}

/**
 * What a transform inside `each.fields` sees: the item first, then the scope
 * the `each` ran in, so a `lookup` table or a `template` path extracted once per
 * record (before the loop) stays reachable from every item. `from` stays
 * relative to the item.
 *
 * @param itemScope - The current item.
 * @param outer - The enclosing lookup: the record's, or an outer item's.
 * @returns The chained lookup.
 */
function itemLookup (itemScope: Record<string, unknown>, outer: TransformContext['lookup']): TransformContext['lookup'] {
  return (path) => {
    const own = getPath(itemScope, path)

    return own === undefined ? outer(path) : own
  }
}

function itemAsScope (item: unknown): Record<string, unknown> {
  return typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {}
}

function finishObject (raw: Record<string, unknown>, fields: Record<string, FieldSpec>, output: OutputRecipe, rules: Map<string, MappingRule>, prefix: string): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(fields)) {
    const path = prefix === '' ? name : `${prefix}.${name}`
    const value = finishField(raw[name], field, output, rules, path)
    if (value !== undefined) data[name] = value
  }

  return data
}

function finishField (rawValue: unknown, field: FieldSpec, output: OutputRecipe, rules: Map<string, MappingRule>, path: string): unknown {
  const value = rawValue !== undefined && rawValue !== null && field.type === 'object' && field.fields !== undefined
    ? finishObject(rawValue as Record<string, unknown>, field.fields, output, rules, path)
    : coerceOrReject(rawValue, field, path, rules)
  const emptyObject = field.type === 'object' && !isMissing(value) && Object.keys(value as Record<string, unknown>).length === 0
  if (!emptyObject && !isMissing(value)) {
    const problems = validateField(value, field)
    if (problems.length > 0) return reject(field, path, problems.join('; '), rules.get(path), output)

    return value
  }
  const policy = resolveMissingPolicy(field, output, rules.get(path))
  if (policy === 'default') return field.default
  if (policy === 'null') return field.nullable === true || field.required !== true ? null : reject(field, path, 'missing', rules.get(path), output, 'fail')

  return reject(field, path, 'missing', rules.get(path), output, policy)
}

function coerceOrReject (rawValue: unknown, field: FieldSpec, path: string, rules: Map<string, MappingRule>): unknown {
  try {
    return coerceValue(rawValue, field, path)
  } catch (error) {
    const policy = resolveMissingPolicy(field, { kind: 'output', id: '', version: 1, fields: {} }, rules.get(path))
    if (policy === 'skip-record') throw new RecordRejectedError(path, (error as Error).message)
    throw new MappingFailedError(path, (error as Error).message, { cause: error })
  }
}

function reject (field: FieldSpec, path: string, reason: string, rule: MappingRule | undefined, output: OutputRecipe, policy = resolveMissingPolicy(field, output, rule)): never {
  if (policy === 'skip-record') throw new RecordRejectedError(path, reason)
  throw new MappingFailedError(path, reason)
}
