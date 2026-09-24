import type { Locator, Page } from 'playwright'
import type { ExtractionScope } from '../extraction-scope'
import type { ClickStep, FillStep, PressStep, ScreenshotStep, ScrollStep, WaitStep } from '../recipe-schema'
import { renderText } from '../template'

const OPTIONAL_TIMEOUT_MS = 2000
const SCROLL_SETTLE_MS = 300

export async function click (step: ClickStep, page: Page): Promise<void> {
  const target = page.locator(step.selector).first()
  if (step.optional === true && !await appears(target, OPTIONAL_TIMEOUT_MS)) return
  await target.click()
}

export async function fill (step: FillStep, page: Page, scope: ExtractionScope): Promise<void> {
  await page.locator(step.selector).first().fill(renderText(step.value, path => scope.lookup(path)))
}

export async function press (step: PressStep, page: Page): Promise<void> {
  if (step.selector === undefined) {
    await page.keyboard.press(step.key)

    return
  }
  await page.locator(step.selector).first().press(step.key)
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
