import { z } from 'zod'
import { MISSING_POLICIES } from './recipe-kind.enum'
import type { MissingPolicy } from './recipe-kind.enum'

/** One operation in a mapping chain. The set is closed: extension happens through `hook`. */
export type TransformRule =
  | { op: 'trim' } | { op: 'lowercase' } | { op: 'uppercase' } |
  { op: 'replace', pattern: string, replacement: string, flags?: string } |
  { op: 'regex', pattern: string, group?: number, flags?: string } |
  { op: 'split', separator: string } | { op: 'join', separator: string } |
  { op: 'first' } | { op: 'last' } | { op: 'nth', index: number } | { op: 'slice', start: number, end?: number } |
  { op: 'concat', separator?: string } | { op: 'coalesce' } | { op: 'default', value: unknown } |
  { op: 'number', locale?: string } | { op: 'integer' } | { op: 'boolean', truthy?: string[] } |
  { op: 'currency', locale?: string, currency?: string } |
  { op: 'date', format?: string, timezone?: string } |
  { op: 'absoluteUrl', base?: string } |
  { op: 'flatten' } | { op: 'unique' } | { op: 'sum' } | { op: 'count' } |
  { op: 'template', value: string } |
  { op: 'jsonpath', path: string } |
  { op: 'hook', name: string, args?: Record<string, unknown> }

export type TransformOp = TransformRule['op']

/** Binds one output field to extracted values. */
export type MappingRule =
  | { from: string | string[], transform?: TransformRule[], onMissing?: MissingPolicy } |
  /** Builds an array of objects from a list: `fields` paths are relative to each list item. */
  { each: string, fields: Record<string, MappingRule>, onMissing?: MissingPolicy }

export type FromRule = Extract<MappingRule, { from: unknown }>
export type EachRule = Extract<MappingRule, { each: unknown }>

const args = z.record(z.string(), z.unknown())
const stringList = z.array(z.string())

export const transformRuleSchema: z.ZodType<TransformRule> = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('trim') }),
  z.strictObject({ op: z.literal('lowercase') }),
  z.strictObject({ op: z.literal('uppercase') }),
  z.strictObject({ op: z.literal('replace'), pattern: z.string(), replacement: z.string(), flags: z.string().optional() }),
  z.strictObject({ op: z.literal('regex'), pattern: z.string().min(1), group: z.int().nonnegative().optional(), flags: z.string().optional() }),
  z.strictObject({ op: z.literal('split'), separator: z.string() }),
  z.strictObject({ op: z.literal('join'), separator: z.string() }),
  z.strictObject({ op: z.literal('first') }),
  z.strictObject({ op: z.literal('last') }),
  z.strictObject({ op: z.literal('nth'), index: z.int() }),
  z.strictObject({ op: z.literal('slice'), start: z.int(), end: z.int().optional() }),
  z.strictObject({ op: z.literal('concat'), separator: z.string().optional() }),
  z.strictObject({ op: z.literal('coalesce') }),
  z.strictObject({ op: z.literal('default'), value: z.unknown() }),
  z.strictObject({ op: z.literal('number'), locale: z.string().optional() }),
  z.strictObject({ op: z.literal('integer') }),
  z.strictObject({ op: z.literal('boolean'), truthy: stringList.optional() }),
  z.strictObject({ op: z.literal('currency'), locale: z.string().optional(), currency: z.string().length(3).optional() }),
  z.strictObject({ op: z.literal('date'), format: z.string().optional(), timezone: z.string().optional() }),
  z.strictObject({ op: z.literal('absoluteUrl'), base: z.string().optional() }),
  z.strictObject({ op: z.literal('flatten') }),
  z.strictObject({ op: z.literal('unique') }),
  z.strictObject({ op: z.literal('sum') }),
  z.strictObject({ op: z.literal('count') }),
  z.strictObject({ op: z.literal('template'), value: z.string() }),
  z.strictObject({ op: z.literal('jsonpath'), path: z.string().min(1) }),
  z.strictObject({ op: z.literal('hook'), name: z.string().min(1), args: args.optional() }),
])

const name = z.string().min(1)
const source = z.union([name, z.array(name).min(1)])
const transforms = z.array(transformRuleSchema).optional()
const missing = z.enum(MISSING_POLICIES).optional()
const key = z.string()
const nestedRules = z.lazy(() => z.record(key, mappingRuleSchema))

export const mappingRuleSchema: z.ZodType<MappingRule> = z.union([
  z.strictObject({ from: source, transform: transforms, onMissing: missing }),
  z.strictObject({ each: name, fields: nestedRules, onMissing: missing }),
])
