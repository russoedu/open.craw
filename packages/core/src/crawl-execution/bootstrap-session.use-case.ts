import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { BrowserClient, StorageState } from '../browser-session'
import type { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { HookRegistry } from '../hooks'
import type { InputRecipe } from '../recipe-schema'
import { runSteps } from '../step-flow'
import { WebStepRunner } from '../web-steps'

export interface BootstrapDependencies {
  /** Launches (or returns) the shared browser; only called when a browser is needed. */
  browser:          () => Promise<BrowserClient>
  hooks:            HookRegistry
  events:           EventBus
  storageStateDir?: string
}

/**
 * The storage state a recipe starts from: a saved file, else what its
 * `session.bootstrap` steps produce in a browser (filtered by `keep`, saved
 * when asked), else nothing.
 *
 * @param recipe - The input recipe.
 * @param deps - Browser, hooks, events.
 * @returns The state, or `undefined` when the recipe declares none.
 */
export async function resolveStorageState (recipe: InputRecipe, deps: BootstrapDependencies): Promise<StorageState | undefined> {
  const session = recipe.session
  if (session?.storageStatePath !== undefined) {
    const path = resolve(deps.storageStateDir ?? '.', session.storageStatePath)

    return JSON.parse(await readFile(path, 'utf8')) as StorageState
  }
  if (session?.bootstrap === undefined) return undefined

  const browser = await deps.browser()
  const browserSession = await browser.newSession({ cookies: session.cookies, headers: session.headers, userAgent: session.userAgent, viewport: session.viewport })
  try {
    const runner = new WebStepRunner(browserSession, recipe, deps.events)
    const scope = new ExtractionScope()
    scope.set('vars', recipe.vars ?? {})
    scope.set('start', { url: recipe.start[0].url })
    scope.setPage({ url: recipe.start[0].url, number: 1 })
    await runSteps(session.bootstrap.steps, scope, {
      recipe,
      runner,
      hooks:  deps.hooks,
      events: deps.events,
      onEmit: async () => { throw new Error('a bootstrap produces a session, not records') },
    }, 'session.bootstrap.steps')
    const full = await browserSession.storageState()
    const kept: StorageState = {
      cookies: session.bootstrap.keep.includes('cookies') ? full.cookies : [],
      origins: session.bootstrap.keep.includes('localStorage') ? full.origins : [],
    }
    if (session.bootstrap.saveTo !== undefined) {
      const path = resolve(deps.storageStateDir ?? '.', session.bootstrap.saveTo)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, `${JSON.stringify(kept, null, 2)}\n`)
    }

    return kept
  } finally {
    await browserSession.close()
  }
}
