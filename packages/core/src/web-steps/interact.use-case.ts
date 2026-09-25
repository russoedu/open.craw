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
export async function select (step: SelectStep, page: Page, scope: ExtractionScope): Promise<void> {
  const lookup = (path: string): unknown => scope.lookup(path)
  const target = targetOf(step, page, scope)
  if (step.index !== undefined) {
    await target.selectOption({ index: step.index })
  } else if (step.label === undefined) {
    await target.selectOption({ value: renderText(step.value ?? '', lookup) })
  } else {
    await target.selectOption({ label: renderText(step.label, lookup) })
  }
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

export async function wait (step: WaitStep, page: Page): Promise<void> {
  if (step.selector !== undefined) await page.locator(step.selector).first().waitFor({ state: 'visible' })
  if (step.ms !== undefined) await page.waitForTimeout(step.ms)
  if (step.state !== undefined) await page.waitForLoadState(step.state)
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
