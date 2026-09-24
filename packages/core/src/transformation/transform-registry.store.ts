import type { HookRegistry } from '../hooks'
import type { TransformOp, TransformRule } from '../recipe-schema'
import { selectJson } from '../selection'
import type { Lookup } from '../template'
import { render } from '../template'
import { asList, coalesce, concat, count, first, flatten, join, last, nth, slice, sum, unique } from './collection.algorithm'
import { parseCurrency } from './currency.algorithm'
import { parseDate } from './date.algorithm'
import { group, lookup } from './lookup.algorithm'
import { parseBoolean, parseInteger, parseNumber } from './number.algorithm'
import { lowercase, regex, replace, split, trim, uppercase } from './string.algorithm'
import { absoluteUrl } from './url.algorithm'

/** What a transform may need besides its input. */
export interface TransformContext {
  recipeId: string
  /** Resolves template paths against the current scope. */
  lookup:   Lookup
  /** The scope snapshot, for hooks. */
  scope:    Record<string, unknown>
  hooks:    HookRegistry
  /** The current page URL; `absoluteUrl` resolves against it by default. */
  baseUrl?: string
  log:      (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
}

type RuleOf<Op extends TransformOp> = Extract<TransformRule, { op: Op }>

/** One registered operation. `elementwise` ops apply to each item when the input is a list. */
interface Registered<Op extends TransformOp = TransformOp> {
  elementwise: boolean
  apply:       (value: unknown, rule: RuleOf<Op>, context: TransformContext) => unknown
}

function scalar<Op extends TransformOp> (apply: Registered<Op>['apply']): Registered<Op> {
  return { elementwise: true, apply }
}

function list<Op extends TransformOp> (apply: Registered<Op>['apply']): Registered<Op> {
  return { elementwise: false, apply }
}

/** The closed set of built-in transforms, one per `TransformRule` op. */
export const BUILT_IN_TRANSFORMS: { [Op in TransformOp]: Registered<Op> } = {
  trim:        scalar(value => trim(value)),
  lowercase:   scalar(value => lowercase(value)),
  uppercase:   scalar(value => uppercase(value)),
  replace:     scalar((value, rule) => replace(value, rule.pattern, rule.replacement, rule.flags)),
  regex:       scalar((value, rule) => regex(value, rule.pattern, rule.group, rule.flags)),
  split:       scalar((value, rule) => split(value, rule.separator)),
  join:        list((value, rule) => join(value, rule.separator)),
  first:       list(value => first(value)),
  last:        list(value => last(value)),
  nth:         list((value, rule) => nth(value, rule.index)),
  slice:       list((value, rule) => slice(value, rule.start, rule.end)),
  concat:      list((value, rule) => concat(value, rule.separator)),
  coalesce:    list(value => coalesce(value)),
  default:     list((value, rule) => ([undefined, null, ''].includes(value as null) ? rule.value : value)),
  number:      scalar((value, rule) => parseNumber(value, rule.locale)),
  integer:     scalar(value => parseInteger(value)),
  boolean:     scalar((value, rule) => parseBoolean(value, rule.truthy)),
  currency:    scalar((value, rule) => parseCurrency(value, rule.locale, rule.currency)),
  date:        scalar((value, rule) => parseDate(value, rule.format, rule.timezone)),
  absoluteUrl: scalar((value, rule, context) => absoluteUrl(value, rule.base ?? context.baseUrl)),
  flatten:     list(value => flatten(value)),
  unique:      list(value => unique(value)),
  sum:         list(value => sum(value)),
  count:       list(value => count(value)),
  template:    list((_, rule, context) => render(rule.value, context.lookup)),
  jsonpath:    list((value, rule) => selectJson(value, rule.path)),
  lookup:      scalar((value, rule, context) => lookup(value, context.lookup(rule.in), rule.key, rule.pick)),
  group:       list((value, rule) => group(asList('group', value), rule.by)),
  hook:        list((value, rule, context) => context.hooks.resolve(rule.name)(value, rule.args ?? {}, { recipeId: context.recipeId, scope: context.scope, log: context.log })),
}

/**
 * Looks up the implementation of a rule.
 *
 * @param rule - A transform rule from a recipe.
 * @returns The registered operation.
 */
export function transformFor (rule: TransformRule): Registered {
  return BUILT_IN_TRANSFORMS[rule.op] as Registered
}
