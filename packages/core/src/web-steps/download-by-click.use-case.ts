import { readFile } from 'node:fs/promises'
import type { Page } from 'playwright'
import { documentValue } from '../api-steps'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import { readFileBody } from '../http-session'
import type { ClickStep, InputRecipe } from '../recipe-schema'
import { renderText } from '../template'
import { targetOf } from './interact.use-case'

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000

/**
 * A `click` with `download`: clicks, takes the file the page sends, and reads
 * it like a fetched document (CSV, spreadsheet, PDF, Word, JSON…, by `as` or
 * the file's name). It becomes the current document, the step id holds it,
 * and `saveTo` keeps a copy. A report's "Export to Excel" button, read as data.
 *
 * @param step - The click step.
 * @param page - The page.
 * @param scope - The scope to bind into.
 * @param recipe - For `limits.timeoutMs` and the recipe id.
 * @param events - Where reading warnings go.
 * @throws Error when no download starts in time, or it fails.
 */
export async function downloadByClick (step: ClickStep, page: Page, scope: ExtractionScope, recipe: InputRecipe, events: EventBus): Promise<void> {
  const options = step.download ?? {}
  const timeout = options.timeoutMs ?? recipe.limits?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS
  const [download] = await Promise.all([page.waitForEvent('download', { timeout }), targetOf(step, page, scope).click()])
  const failure = await download.failure()
  if (failure !== null) throw new Error(`the download of ${download.suggestedFilename()} failed: ${failure}`)
  const bytes = await readFile(await download.path())
  if (options.saveTo !== undefined) await download.saveAs(renderText(options.saveTo, path => scope.lookup(path)))
  const { body, warnings } = await readFileBody(bytes, download.suggestedFilename(), options)
  for (const warning of warnings) events.emit({ type: 'warning', recipeId: recipe.id, message: `${download.suggestedFilename()}: ${warning}` })
  scope.setDocument(body)
  if (step.id !== undefined) scope.set(step.id, documentValue(body))
}
