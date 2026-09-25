import { z } from 'zod'
import { BODY_KINDS, ERROR_POLICIES, HTTP_METHODS, SELECTOR_KINDS, TAKE_KINDS, WAIT_UNTIL } from './recipe-kind.enum'
import type { BodyKind, HttpMethod, SelectorKind, WaitUntil } from './recipe-kind.enum'

/** What to do when a step fails. Resolved step -> recipe -> `fail`. */
export type ErrorPolicy =
  | { policy: 'fail' } |
  { policy: 'skip' } |
  { policy: 'retry', attempts: number, backoffMs?: number }

/** What a value is taken from an element or JSON node: text, inner HTML, an attribute, an input value, or the node itself. */
export type TakeKind = typeof TAKE_KINDS[number] | `attr:${string}`

/** How `paginate` finds the next page once the page body has run. */
export type PaginateNext =
  | { selector: string } |
  { url: string } |
  { jsonpath: string, as?: string }

export interface StepBaseFields {
  /** Names the value this step produces. */
  id?:      string
  onError?: ErrorPolicy
  /** A template; the step runs only when it renders truthy. */
  when?:    string
}

export interface GotoStep extends StepBaseFields { type: 'goto', url: string, waitUntil?: WaitUntil }
/** Where an interaction lands: a selector, or a `target` template that renders to a live element (a `forEach` over `selector`) or to a selector string. */
export interface TargetFields { selector?: string, target?: string }
export interface ClickStep extends StepBaseFields, TargetFields { type: 'click', optional?: boolean }
export interface FillStep extends StepBaseFields, TargetFields { type: 'fill', value: string }
export interface PressStep extends StepBaseFields, TargetFields { type: 'press', key: string }
/** Picks an option of a `<select>` by value, label or index. */
export interface SelectStep extends StepBaseFields, TargetFields { type: 'select', value?: string, label?: string, index?: number }
export interface ScrollStep extends StepBaseFields { type: 'scroll', to: string, times?: number, untilStable?: boolean }
export interface WaitStep extends StepBaseFields { type: 'wait', selector?: string, ms?: number, state?: 'networkidle' }
export interface EvaluateStep extends StepBaseFields { type: 'evaluate', script: string }
export interface ScreenshotStep extends StepBaseFields { type: 'screenshot', path: string }
export interface RequestStep extends StepBaseFields {
  type:     'request'
  method?:  HttpMethod
  url:      string
  query?:   Record<string, string>
  headers?: Record<string, string>
  body?:    unknown
  as?:      BodyKind
}
export interface ExtractStep extends StepBaseFields {
  type:     'extract'
  selector: string
  kind:     SelectorKind
  take?:    TakeKind
  many?:    boolean
  /** Id of a document or fragment to read instead of the current document. */
  from?:    string
}
export interface SetStep extends StepBaseFields { type: 'set', value: unknown }
/**
 * Appends to a list bound in an enclosing scope (a `set` to `[]` before the
 * loop), so values gathered page by page or item by item outlive the child
 * scope that found them. A list value is appended item by item.
 */
export interface CollectStep extends StepBaseFields { type: 'collect', into: string, value: unknown }
/** Runs a body per item of a list (`over`) or per live element matching `selector` (web mode; the elements are re-resolved on every use). */
export interface ForEachStep extends StepBaseFields { type: 'forEach', over?: string, selector?: string, as: string, steps: Step[], emit?: true | { output: string } }
/** Runs `steps` when `test` renders truthy, else `else`; both in the current scope. */
export interface IfStep extends StepBaseFields { type: 'if', test: string, steps: Step[], else?: Step[] }
export interface PaginateStep extends StepBaseFields { type: 'paginate', next: PaginateNext, until?: string, maxPages?: number, steps: Step[] }
export interface EmitStep extends StepBaseFields { type: 'emit', output?: string }
export interface HookStep extends StepBaseFields { type: 'hook', name: string, args?: Record<string, unknown> }

export type Step =
  | GotoStep | ClickStep | FillStep | PressStep | SelectStep | ScrollStep | WaitStep | EvaluateStep | ScreenshotStep |
  RequestStep | ExtractStep | SetStep | CollectStep | ForEachStep | IfStep | PaginateStep | EmitStep | HookStep

export type StepType = Step['type']

export const errorPolicySchema: z.ZodType<ErrorPolicy> = z.discriminatedUnion('policy', [
  z.strictObject({ policy: z.literal(ERROR_POLICIES[0]) }),
  z.strictObject({ policy: z.literal(ERROR_POLICIES[1]) }),
  z.strictObject({ policy: z.literal(ERROR_POLICIES[2]), attempts: z.int().min(1).max(20), backoffMs: z.int().nonnegative().optional() }),
])

const takeKindSchema = z.union([z.enum(TAKE_KINDS), z.string().regex(/^attr:[\w:-]+$/, 'take is text, html, value, json or attr:<name>')]) as z.ZodType<TakeKind>

export const paginateNextSchema: z.ZodType<PaginateNext> = z.union([
  z.strictObject({ selector: z.string().min(1) }),
  z.strictObject({ url: z.string().min(1) }),
  z.strictObject({ jsonpath: z.string().min(1), as: z.string().regex(/^[A-Z_]\w*$/i).optional() }),
])

const stepId = z.string().regex(/^[A-Z_]\w*$/i, 'an id is a word: letters, digits and underscores, not starting with a digit')
const base = { id: stepId.optional(), onError: errorPolicySchema.optional(), when: z.string().optional() }
const stringMap = z.record(z.string(), z.string())

const target = { selector: z.string().min(1).optional(), target: z.string().min(1).optional() }
const ONE_TARGET = 'give exactly one of selector or target'
const oneTarget = (step: { selector?: string, target?: string }): boolean => (step.selector === undefined) !== (step.target === undefined)
const gotoStep = z.strictObject({ ...base, type: z.literal('goto'), url: z.string().min(1), waitUntil: z.enum(WAIT_UNTIL).optional() })
const clickStep = z.strictObject({ ...base, ...target, type: z.literal('click'), optional: z.boolean().optional() }).refine(oneTarget, ONE_TARGET)
const fillStep = z.strictObject({ ...base, ...target, type: z.literal('fill'), value: z.string() }).refine(oneTarget, ONE_TARGET)
const pressStep = z.strictObject({ ...base, ...target, type: z.literal('press'), key: z.string().min(1) })
  .refine(step => step.selector === undefined || step.target === undefined, 'give selector or target, not both')
const selectStep = z.strictObject({ ...base, ...target, type: z.literal('select'), value: z.string().optional(), label: z.string().optional(), index: z.int().nonnegative().optional() })
  .refine(oneTarget, ONE_TARGET)
  .refine(step => [step.value, step.label, step.index].filter(choice => choice !== undefined).length === 1, 'give exactly one of value, label or index')
const scrollStep = z.strictObject({ ...base, type: z.literal('scroll'), to: z.string().min(1), times: z.int().min(1).optional(), untilStable: z.boolean().optional() })
const waitStep = z.strictObject({ ...base, type: z.literal('wait'), selector: z.string().optional(), ms: z.int().nonnegative().optional(), state: z.literal('networkidle').optional() })
const evaluateStep = z.strictObject({ ...base, type: z.literal('evaluate'), script: z.string().min(1) })
const screenshotStep = z.strictObject({ ...base, type: z.literal('screenshot'), path: z.string().min(1) })
const requestStep = z.strictObject({
  ...base,
  type:    z.literal('request'),
  method:  z.enum(HTTP_METHODS).optional(),
  url:     z.string().min(1),
  query:   stringMap.optional(),
  headers: stringMap.optional(),
  body:    z.unknown().optional(),
  as:      z.enum(BODY_KINDS).optional(),
})
const extractStep = z.strictObject({
  ...base,
  type:     z.literal('extract'),
  selector: z.string().min(1),
  kind:     z.enum(SELECTOR_KINDS),
  take:     takeKindSchema.optional(),
  many:     z.boolean().optional(),
  from:     stepId.optional(),
})
const assignStep = z.strictObject({ ...base, type: z.literal('set'), value: z.unknown() })
const collectStep = z.strictObject({ ...base, type: z.literal('collect'), into: stepId, value: z.unknown() })
const emitStep = z.strictObject({ ...base, type: z.literal('emit'), output: z.string().optional() })
const hookStep = z.strictObject({ ...base, type: z.literal('hook'), name: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() })

const emitFlag = z.union([z.literal(true), z.strictObject({ output: z.string().min(1) })])

const steps = z.lazy(() => z.array(stepSchema))
const forEachStep = z.strictObject({ ...base, type: z.literal('forEach'), over: stepId.optional(), selector: z.string().min(1).optional(), as: stepId, steps, emit: emitFlag.optional() })
  .refine(step => (step.over === undefined) !== (step.selector === undefined), 'give exactly one of over (a list id) or selector (live elements)')
const ifStep = z.strictObject({ ...base, type: z.literal('if'), test: z.string().min(1), steps, else: steps.optional() })
const paginateStep = z.strictObject({
  ...base,
  type:     z.literal('paginate'),
  next:     paginateNextSchema,
  until:    z.string().optional(),
  maxPages: z.int().min(1).optional(),
  steps,
})

export const stepSchema: z.ZodType<Step> = z.discriminatedUnion('type', [
  gotoStep, clickStep, fillStep, pressStep, selectStep, scrollStep, waitStep, evaluateStep, screenshotStep,
  requestStep, extractStep, assignStep, collectStep, emitStep, hookStep, forEachStep, ifStep, paginateStep,
])
