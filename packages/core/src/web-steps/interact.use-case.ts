import type { Locator, Page } from 'playwright'
import { isLiveElement } from '../extraction-scope'
import type { ExtractionScope } from '../extraction-scope'
import type { ClickStep, FillStep, PressStep, ScreenshotStep, ScrollStep, SelectStep, TargetFields, WaitStep } from '../recipe-schema'
import { render, renderText } from '../template'

const OPTIONAL_TIMEOUT_MS = 2000
const SCROLL_SETTLE_MS = 300

/**
 * The element an interaction lands on: the first match of `selector`, or what
 * `target` renders to - a live element (re-resolved by selector and index, so a
 * re-render since the loop started does not matter) or a selector string.
 *
 * @param step - A step with `selector` or `target`.
 * @param page - The page.
 * @param scope - Where `target` is resolved.
 * @returns The locator.
 * @throws Error when `target` renders to something that is neither.
 */
export function targetOf (step: TargetFields, page: Page, scope: ExtractionScope): Locator {
  if (step.target === undefined) return page.locator(step.selector ?? '').first()
  const value = render(step.target, path => scope.lookup(path))
  if (isLiveElement(value)) return page.locator(value.selector).nth(value.index)
  if (typeof value === 'string' && value !== '') return page.locator(value).first()
  throw new Error(`target "${step.target}" is neither a live element nor a selector`)
}

export async function click (step: ClickStep, page: Page, scope: ExtractionScope): Promise<void> {
  const target = targetOf(step, page, scope)
  if (step.optional === true && !await appears(target, OPTIONAL_TIMEOUT_MS)) return
  await target.click()
}

export async function fill (step: FillStep, page: Page, scope: ExtractionScope): Promise<void> {
  await targetOf(step, page, scope).fill(renderText(step.value, path => scope.lookup(path)))
}

export async function press (step: PressStep, page: Page, scope: ExtractionScope): Promise<void> {
  if (step.selector === undefined && step.target === undefined) {
    await page.keyboard.press(step.key)

    return
  }
  await targetOf(step, page, scope).press(step.key)
}

/** Picks an option of a `<select>` by value, label or index; each is a template. */
/** What a select wants, in the page: option values or labels, or an index. */
interface OptionQuery {
  wanted:     string[]
  index?:     number
  ignoreCase: boolean
  multiple:   boolean
}

/** What the page's select holds for a query: the option values to choose, what matched nothing, and a sample of what is there. */
interface OptionMatch {
  values:  string[]
  missing: string[]
  sample:  string[]
}

const OPTION_POLL_MS = 250
const DEFAULT_OPTION_TIMEOUT_MS = 30_000

/**
 * Runs a `select` step. One `value`, `label` or `index` goes through
 * Playwright, as a user picks (the select must be visible). `values`,
 * `multiple` or `force` resolve each wanted value or label to its option,
 * waiting while the page has not loaded it yet (a list that fills after
 * another pick); with `force` the options are set on the element itself and
 * `input` and `change` fired, so a hidden select behind a widget is driven the
 * way the widget drives it.
 *
 * @param step - The step.
 * @param page - The page.
 * @param scope - The scope its templates render in.
 * @param timeoutMs - The recipe's `limits.timeoutMs`, used when the step sets none.
 * @throws Error naming what matched no option once the time is up.
 */
export async function select (step: SelectStep, page: Page, scope: ExtractionScope, timeoutMs?: number): Promise<void> {
  const lookup = (path: string): unknown => scope.lookup(path)
  const target = targetOf(step, page, scope)
  if (step.values !== undefined || step.multiple === true || step.force === true) {
    const query: OptionQuery = { wanted: wantedOf(step, lookup), index: step.index, ignoreCase: step.ignoreCase === true, multiple: step.multiple === true }
    const values = await optionsFor(target, query, step.timeoutMs ?? timeoutMs ?? DEFAULT_OPTION_TIMEOUT_MS)
    await (step.force === true ? target.evaluate(chooseOptions, values) : target.selectOption(values))

    return
  }
  if (step.index !== undefined) {
    await target.selectOption({ index: step.index })
  } else if (step.label === undefined) {
    await target.selectOption({ value: renderText(step.value ?? '', lookup) })
  } else {
    await target.selectOption({ label: renderText(step.label, lookup) })
  }
}

/** The values and labels a step wants: `values` (an item rendering a list adds each), else `value` or `label`. */
function wantedOf (step: SelectStep, lookup: (path: string) => unknown): string[] {
  const items = step.values ?? [step.value ?? step.label].filter((item): item is string => item !== undefined)

  return items.flatMap((item) => {
    const value = render(item, lookup)

    return (Array.isArray(value) ? value : [value]).map(entry => String(entry ?? '').trim()).filter(entry => entry !== '')
  })
}

/** Waits until every wanted option exists, then gives their values. */
async function optionsFor (target: Locator, query: OptionQuery, timeoutMs: number): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const match = await target.evaluate(matchOptions, query)
    if (match.missing.length === 0) return match.values
    if (Date.now() >= deadline) throw new Error(`no option ${match.missing.map(item => `"${item}"`).join(', ')} after ${timeoutMs} ms (options: ${match.sample.join(', ') || 'none'})`)
    await target.page().waitForTimeout(OPTION_POLL_MS)
  }
}

/** Runs inside the page. Keep it self-contained; it is serialised. */
function matchOptions (element: Element, query: OptionQuery): OptionMatch {
  const select = element as HTMLSelectElement
  const options = [...select.options]
  const fold = (text: string): string => (query.ignoreCase ? text.trim().toLowerCase() : text.trim())
  const sample = options.slice(0, 10).map(option => option.text.trim())
  if (query.index !== undefined) {
    const option = options[query.index]

    return option === undefined ? { values: [], missing: [`#${query.index}`], sample } : { values: [option.value], missing: [], sample }
  }
  const chosen = query.multiple ? options.filter(option => option.selected).map(option => option.value) : []
  const missing: string[] = []
  for (const wanted of query.wanted) {
    const option = options.find(candidate => fold(candidate.value) === fold(wanted)) ?? options.find(candidate => fold(candidate.text) === fold(wanted))
    if (option === undefined) missing.push(wanted)
    else if (!chosen.includes(option.value)) chosen.push(option.value)
  }

  return { values: chosen, missing, sample }
}

/** Runs inside the page. Keep it self-contained; it is serialised. */
function chooseOptions (element: Element, values: string[]): void {
  const select = element as HTMLSelectElement
  for (const option of select.options) option.selected = values.includes(option.value)
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Scrolls to the bottom (or to an element) `times` times; with `untilStable`
 * it keeps going until the page stops growing, which is how infinite lists end.
 */
export async function scroll (step: ScrollStep, page: Page): Promise<void> {
  const times = step.untilStable === true ? Infinity : (step.times ?? 1)
  let previous = -1
  for (let count = 0; count < times; count += 1) {
    if (step.to === 'bottom') {
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    } else {
      await page.locator(step.to).first().scrollIntoViewIfNeeded()
    }
    await page.waitForTimeout(SCROLL_SETTLE_MS)
    const height = await page.evaluate<number>('document.body.scrollHeight')
    if (height === previous && step.untilStable === true) break
    previous = height
  }
}

/**
 * Runs a `wait` step: for an element to show, a time, or the network to settle.
 *
 * @param step - The step; its `timeoutMs` bounds the element and network forms.
 * @param page - The page.
 * @param timeoutMs - The recipe's `limits.timeoutMs`, used when the step sets none; the browser default otherwise.
 */
export async function wait (step: WaitStep, page: Page, timeoutMs?: number): Promise<void> {
  const timeout = step.timeoutMs ?? timeoutMs
  if (step.selector !== undefined) await page.locator(step.selector).first().waitFor({ state: 'visible', timeout })
  if (step.ms !== undefined) await page.waitForTimeout(step.ms)
  if (step.state !== undefined) await page.waitForLoadState(step.state, { timeout })
}

/**
 * Whether a locator becomes visible within a timeout. Never throws.
 *
 * @param target - The locator.
 * @param timeout - Milliseconds to wait.
 * @returns `true` when visible in time.
 */
export async function appears (target: Locator, timeout: number): Promise<boolean> {
  try {
    await target.waitFor({ state: 'visible', timeout })

    return true
  } catch {
    return false
  }
}

export async function screenshot (step: ScreenshotStep, page: Page, scope: ExtractionScope): Promise<void> {
  await page.screenshot({ path: renderText(step.path, path => scope.lookup(path)), fullPage: true })
}
