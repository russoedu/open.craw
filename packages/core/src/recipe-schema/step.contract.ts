import { z } from 'zod'
import { BODY_KINDS, YAML_SCALARS, ERROR_POLICIES, HTTP_METHODS, SELECTOR_KINDS, TABLE_ALIGNS, TAKE_KINDS, WAIT_UNTIL } from './recipe-kind.enum'
import type { BodyKind, HttpMethod, SelectorKind, TableAlign, WaitUntil } from './recipe-kind.enum'

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

/**
 * When a page counts as loaded: an element that must show. A site that
 * sometimes serves a page without its content (a slow backend, a half-rendered
 * shell) is loaded again, up to `reloads` times.
 */
export interface GotoReady {
  selector:   string
  /** How long to wait for it on each load; `limits.timeoutMs`, else 30 s. */
  timeoutMs?: number
  /** Loads after the first. Default 2. */
  reloads?:   number
}
export interface GotoStep extends StepBaseFields { type: 'goto', url: string, waitUntil?: WaitUntil, ready?: GotoReady }
/** Where an interaction lands: a selector, or a `target` template that renders to a live element (a `forEach` over `selector`) or to a selector string. */
export interface TargetFields { selector?: string, target?: string }
export interface ClickStep extends StepBaseFields, TargetFields { type: 'click', optional?: boolean }
export interface FillStep extends StepBaseFields, TargetFields { type: 'fill', value: string }
export interface PressStep extends StepBaseFields, TargetFields { type: 'press', key: string }
/** Picks an option of a `<select>` by value, label or index. */
export interface SelectStep extends StepBaseFields, TargetFields { type: 'select', value?: string, label?: string, index?: number }
export interface ScrollStep extends StepBaseFields { type: 'scroll', to: string, times?: number, untilStable?: boolean }
/** Waits for an element, a time or the network to settle; `timeoutMs` bounds the element and network forms (default `limits.timeoutMs`). */
export interface WaitStep extends StepBaseFields { type: 'wait', selector?: string, ms?: number, state?: 'networkidle', timeoutMs?: number }
/**
 * Runs JavaScript in the page and binds its result under `id`. `script` is a
 * template; with `args`, it is a function expression called with them (each
 * string in `args` rendered, a lone placeholder keeping its type).
 */
export interface EvaluateStep extends StepBaseFields { type: 'evaluate', script: string, args?: Record<string, unknown> }
export interface ScreenshotStep extends StepBaseFields { type: 'screenshot', path: string }
/**
 * A request body taken from a form on the live page (web mode): its fields as
 * the browser would post them, url-encoded, without `omit`, with `set` (each
 * value a template) replacing or adding fields.
 */
export interface RequestForm {
  selector: string
  omit?:    string[]
  set?:     Record<string, string>
}

export interface RequestStep extends StepBaseFields {
  type:       'request'
  method?:    HttpMethod
  url:        string
  query?:     Record<string, string>
  headers?:   Record<string, string>
  body?:      unknown
  /** The body from a form on the page (web mode); instead of `body`. */
  form?:      RequestForm
  as?:        BodyKind
  /** The body's text encoding (a WHATWG label, `windows-1252`); default: the BOM, the declared charset, UTF-8, else Windows-1252. */
  encoding?:  string
  /** A CSV body's delimiter (one character); default: detected among `,` `;` tab `|`. */
  delimiter?: string
  /** A YAML body's scalars: `typed` (default, YAML 1.2) or `text`, every scalar as written (`0123` stays `"0123"`). */
  scalars?:   'typed' | 'text'
}
export interface ExtractStep extends StepBaseFields {
  type:              'extract'
  selector:          string
  kind:              SelectorKind
  take?:             TakeKind
  many?:             boolean
  /** Id of a document or fragment to read instead of the current document. */
  from?:             string
  /** `table` only: output key -> a pattern (case-insensitive) for that column's header cell. */
  columns?:          Record<string, string>
  /** `table` only: a pattern (case-insensitive) for the row that ends a table. */
  until?:            string
  /** `table` only: how a row's values sit against a cell wrapped over several lines (PDF); default `auto`. */
  align?:            TableAlign
  /** `table` only: a pattern (case-insensitive) for the names of the sheets to read (workbook); default every sheet. */
  sheet?:            string
  /** `table` only: how many rows the header spans (workbook); a column's key joins its header texts. Default 1. */
  headerRows?:       number
  /** `table` only: output keys whose empty cells take the value of the row above. */
  fillDown?:         string[]
  /** `table` only: read hidden sheets and rows (workbook) or hidden slides (deck) too. */
  includeHidden?:    boolean
  /** `table` only: a pattern (case-insensitive) for the titles of the slides to read (deck); default every slide. */
  slide?:            string
  /** `table` only: read text boxes laid out as a table instead of native tables (deck). */
  shapes?:           boolean
  /** `xpath` on XML only: prefix to namespace URI (`{ "atom": "http://www.w3.org/2005/Atom" }`). Prefixes the root declares are known already. */
  namespaces?:       Record<string, string>
  /** `xpath` on XML only: drop the document's namespaces, so `//entry/title` matches `<entry xmlns="…">`. */
  ignoreNamespaces?: boolean
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

/**
 * How the engine confirms a captcha was solved (it never takes the solver's
 * word): the challenge is gone, and/or an element appears.
 */
export interface CaptchaCheck {
  /** The detected challenge must be off the page. Default `true`; `false` for a form captcha (`image`), whose page keeps a captcha. */
  gone?:      boolean
  /** An element that must appear once solved. */
  selector?:  string
  /** An element that shows when the answer was refused ("Invalid CAPTCHA"): the attempt fails at once instead of by timeout. */
  failure?:   string
  /** How long the page has to confirm, a submit's navigation included. Default 10000. */
  timeoutMs?: number
}

/** The steps a form captcha's `submit` may hold: interactions on the page. */
export type CaptchaSubmitStep = ClickStep | FillStep | PressStep | SelectStep | WaitStep | EvaluateStep

/**
 * Solves the captcha on the live page, if there is one (none is not an error):
 * a challenge known to sit at one point of the crawl, a login form. The solver
 * and the defaults come from `session.captcha`, unless the step names its own.
 */
export interface CaptchaStep extends StepBaseFields {
  type:       'captcha'
  /** A captcha solver the runner registered; `session.captcha.solver` when omitted. */
  solver?:    string
  /** Where the challenge is (a Playwright selector); the common widgets when omitted. */
  selector?:  string
  /**
   * A form captcha: the image of the code. The step solves it when the image
   * shows; the solver reads it and fills `field`; the engine runs `submit` and
   * waits for `verify.selector` or `verify.failure`.
   */
  image?:     string
  /** What gives a new image (handed to the solver). */
  refresh?:   string
  /** Where the answer goes (handed to the solver). */
  field?:     string
  /** What sends the answer, run after the solver on every attempt: a click on the form's button, or the fills a form that clears itself needs first. */
  submit?:    CaptchaSubmitStep[]
  verify?:    CaptchaCheck
  attempts?:  number
  timeoutMs?: number
}

export type Step =
  | GotoStep | ClickStep | FillStep | PressStep | SelectStep | ScrollStep | WaitStep | EvaluateStep | ScreenshotStep |
  RequestStep | ExtractStep | SetStep | CollectStep | ForEachStep | IfStep | PaginateStep | EmitStep | HookStep | CaptchaStep

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

/** A plain selector: never rendered, so a placeholder in it is a mistake that would wait for the braces literally. */
const plainSelector = z.string().min(1).refine(selector => !selector.includes('{{'), 'a selector is not a template: put a selector with placeholders in "target"')
const target = { selector: plainSelector.optional(), target: z.string().min(1).optional() }
const ONE_TARGET = 'give exactly one of selector or target'
const oneTarget = (step: { selector?: string, target?: string }): boolean => (step.selector === undefined) !== (step.target === undefined)
const gotoReady = z.strictObject({ selector: plainSelector, timeoutMs: z.int().min(1).optional(), reloads: z.int().min(0).max(10).optional() })
const gotoStep = z.strictObject({ ...base, type: z.literal('goto'), url: z.string().min(1), waitUntil: z.enum(WAIT_UNTIL).optional(), ready: gotoReady.optional() })
const clickStep = z.strictObject({ ...base, ...target, type: z.literal('click'), optional: z.boolean().optional() }).refine(oneTarget, ONE_TARGET)
const fillStep = z.strictObject({ ...base, ...target, type: z.literal('fill'), value: z.string() }).refine(oneTarget, ONE_TARGET)
const pressStep = z.strictObject({ ...base, ...target, type: z.literal('press'), key: z.string().min(1) })
  .refine(step => step.selector === undefined || step.target === undefined, 'give selector or target, not both')
const selectStep = z.strictObject({ ...base, ...target, type: z.literal('select'), value: z.string().optional(), label: z.string().optional(), index: z.int().nonnegative().optional() })
  .refine(oneTarget, ONE_TARGET)
  .refine(step => [step.value, step.label, step.index].filter(choice => choice !== undefined).length === 1, 'give exactly one of value, label or index')
const scrollStep = z.strictObject({ ...base, type: z.literal('scroll'), to: z.string().min(1), times: z.int().min(1).optional(), untilStable: z.boolean().optional() })
const waitStep = z.strictObject({ ...base, type: z.literal('wait'), selector: plainSelector.optional(), ms: z.int().nonnegative().optional(), state: z.literal('networkidle').optional(), timeoutMs: z.int().min(1).optional() })
const evaluateStep = z.strictObject({ ...base, type: z.literal('evaluate'), script: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() })
const screenshotStep = z.strictObject({ ...base, type: z.literal('screenshot'), path: z.string().min(1) })
const formFields = z.array(z.string().min(1))
const requestForm = z.strictObject({ selector: plainSelector, omit: formFields.optional(), set: stringMap.optional() })
const requestStep = z.strictObject({
  ...base,
  type:      z.literal('request'),
  method:    z.enum(HTTP_METHODS).optional(),
  url:       z.string().min(1),
  query:     stringMap.optional(),
  headers:   stringMap.optional(),
  body:      z.unknown().optional(),
  form:      requestForm.optional(),
  as:        z.enum(BODY_KINDS).optional(),
  encoding:  z.string().min(1).optional(),
  delimiter: z.string().length(1).optional(),
  scalars:   z.enum(YAML_SCALARS).optional(),
})
  .refine(step => step.body === undefined || step.form === undefined, { message: 'give body or form, not both', path: ['form'] })
  .refine(step => step.delimiter === undefined || step.as === undefined || step.as === 'csv', { message: '"delimiter" reads CSV only: drop it or set "as": "csv"', path: ['delimiter'] })
  .refine(step => step.scalars === undefined || step.as === undefined || step.as === 'yaml', { message: '"scalars" reads YAML only: drop it or set "as": "yaml"', path: ['scalars'] })
const tableOnly = ['columns', 'until', 'align', 'sheet', 'headerRows', 'fillDown', 'includeHidden', 'slide', 'shapes'] as const
const extractStep = z.strictObject({
  ...base,
  type:             z.literal('extract'),
  selector:         z.string().min(1),
  kind:             z.enum(SELECTOR_KINDS),
  take:             takeKindSchema.optional(),
  many:             z.boolean().optional(),
  from:             stepId.optional(),
  columns:          stringMap.optional(),
  until:            z.string().min(1).optional(),
  align:            z.enum(TABLE_ALIGNS).optional(),
  sheet:            z.string().min(1).optional(),
  headerRows:       z.int().min(1).optional(),
  fillDown:         z.array(z.string().min(1)).min(1).optional(),
  includeHidden:    z.boolean().optional(),
  slide:            z.string().min(1).optional(),
  shapes:           z.boolean().optional(),
  namespaces:       z.record(z.string().regex(/^[A-Z_][\w.-]*$/i, 'a namespace prefix such as atom'), z.string().min(1)).optional(),
  ignoreNamespaces: z.boolean().optional(),
}).check((context) => {
  if (context.value.kind !== 'xpath') {
    for (const key of ['namespaces', 'ignoreNamespaces'] as const) {
      if (context.value[key] !== undefined) context.issues.push({ code: 'custom', input: context.value, path: [key], message: `"${key}" belongs to kind "xpath"` })
    }
  }
  if (context.value.kind === 'table') return
  for (const key of tableOnly) {
    if (context.value[key] !== undefined) context.issues.push({ code: 'custom', input: context.value, path: [key], message: `"${key}" belongs to kind "table"` })
  }
})
const assignStep = z.strictObject({ ...base, type: z.literal('set'), value: z.unknown() })
const collectStep = z.strictObject({ ...base, type: z.literal('collect'), into: stepId, value: z.unknown() })
const emitStep = z.strictObject({ ...base, type: z.literal('emit'), output: z.string().optional() })
const hookStep = z.strictObject({ ...base, type: z.literal('hook'), name: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() })

export const captchaCheckSchema: z.ZodType<CaptchaCheck> = z.strictObject({
  gone:      z.boolean().optional(),
  selector:  plainSelector.optional(),
  failure:   plainSelector.optional(),
  timeoutMs: z.int().min(1000).optional(),
})
const captchaSubmitStep = z.union([clickStep, fillStep, pressStep, selectStep, waitStep, evaluateStep])
const FORM_CAPTCHA = 'a form captcha (image or submit) needs verify.selector: the element that shows once the answer is accepted'
const captchaStep = z.strictObject({
  ...base,
  type:      z.literal('captcha'),
  solver:    z.string().min(1).optional(),
  selector:  plainSelector.optional(),
  image:     plainSelector.optional(),
  refresh:   plainSelector.optional(),
  field:     plainSelector.optional(),
  submit:    z.array(captchaSubmitStep).min(1).optional(),
  verify:    captchaCheckSchema.optional(),
  attempts:  z.int().min(1).max(10).optional(),
  timeoutMs: z.int().min(1000).optional(),
})
  .refine(step => step.image === undefined || step.selector === undefined, 'give image (a form captcha) or selector (a widget), not both')
  .refine(step => (step.image === undefined && step.submit === undefined) || step.verify?.selector !== undefined, FORM_CAPTCHA)

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
  requestStep, extractStep, assignStep, collectStep, emitStep, hookStep, forEachStep, ifStep, paginateStep, captchaStep,
])
