import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { AccessLease } from '../access'
import type { BrowserClient, BrowserProfiles, BrowserSession, SessionOptions, StorageState } from '../browser-session'
import type { CaptchaGuard } from '../captcha'
import type { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { HookRegistry } from '../hooks'
import type { InputRecipe } from '../recipe-schema'
import { RunGate, runSteps } from '../step-flow'
import type { HostThrottle } from '../step-flow'
import { WebStepRunner } from '../web-steps'

export interface BootstrapDependencies {
  /** Launches (or returns) the shared browser; only called when a browser is needed. */
  browser:          () => Promise<BrowserClient>
  hooks:            HookRegistry
  events:           EventBus
  storageStateDir?: string
  /** The crawler's per-site throttle: the bootstrap's pages count too. */
  hosts?:           HostThrottle
  /** The runner's persistent browser profiles, for `session.browserProfile`. */
  profiles?:        BrowserProfiles
}

/**
 * The session options an access lease contributes: its proxy, TLS leniency,
 * blocked resources, and its headers under the recipe's own.
 *
 * @param lease - The lease, if any.
 * @param headers - The recipe's `session.headers`.
 * @returns Options for `BrowserClient.newSession`.
 */
export function accessOptions (lease: AccessLease | undefined, headers: Record<string, string> | undefined): Pick<SessionOptions, 'proxy' | 'ignoreHTTPSErrors' | 'blockResources' | 'headers'> {
  const merged = { ...lease?.headers, ...headers }

  return { proxy: lease?.proxy, ignoreHTTPSErrors: lease?.ignoreHTTPSErrors, blockResources: lease?.blockResources, headers: Object.keys(merged).length === 0 ? undefined : merged }
}

/**
 * The storage state a recipe starts from: a saved file, else what its
 * `session.bootstrap` steps produce in a browser (filtered by `keep`, saved
 * when asked), else nothing.
 *
 * The bootstrap runs through the same access lease as the crawl that follows,
 * so a login and the requests that use its cookies come from one IP.
 *
 * With `session.browserProfile`, the bootstrap runs in that profile, and
 * without a bootstrap the profile's own cookies and storage are the state: an
 * api recipe picks up a login a browser left in the profile.
 *
 * @param recipe - The input recipe.
 * @param deps - Browser, hooks, events.
 * @param lease - The recipe run's access; direct when omitted.
 * @param captcha - Solves the bootstrap's captchas (a login form's).
 * @param owner - The recipe run, which a browser profile is held by.
 * @returns The state, or `undefined` when the recipe declares none.
 */
export async function resolveStorageState (recipe: InputRecipe, deps: BootstrapDependencies, lease?: AccessLease, captcha?: CaptchaGuard, owner: object = {}): Promise<StorageState | undefined> {
  const saved = await readSavedState(recipe, deps)
  if (saved !== undefined) return saved
  const session = recipe.session
  if (session?.browserProfile !== undefined) {
    const browserSession = await openBrowserProfile(recipe, deps, lease, owner)
    try {
      return session.bootstrap === undefined ? await browserSession.storageState() : await runBootstrap(recipe, browserSession, deps, captcha)
    } finally {
      await browserSession.close()
    }
  }
  if (session?.bootstrap === undefined) return undefined

  const browser = await deps.browser()
  const browserSession = await browser.newSession({ cookies: session.cookies, userAgent: session.userAgent, viewport: session.viewport, ...accessOptions(lease, session.headers) })
  try {
    return await runBootstrap(recipe, browserSession, deps, captcha)
  } finally {
    await browserSession.close()
  }
}

/**
 * Opens the recipe's `session.browserProfile` with its session options and
 * the lease's proxy.
 *
 * @param recipe - A recipe with `session.browserProfile`.
 * @param deps - For `profiles`.
 * @param lease - The access lease.
 * @param owner - The recipe run.
 * @returns The session in the profile.
 */
export async function openBrowserProfile (recipe: InputRecipe, deps: Pick<BootstrapDependencies, 'profiles'>, lease: AccessLease | undefined, owner: object): Promise<BrowserSession> {
  const session = recipe.session
  const name = session?.browserProfile ?? ''
  if (deps.profiles === undefined) throw new Error(`recipe "${recipe.id}" uses browser profile "${name}", but this crawler has no profiles directory (CrawlOptions.profilesDir)`)

  return deps.profiles.open(name, { cookies: session?.cookies, userAgent: session?.userAgent, viewport: session?.viewport, ...accessOptions(lease, session?.headers) }, owner)
}

/**
 * The storage state saved by an earlier bootstrap (`session.storageStatePath`), if the recipe names one.
 *
 * @param recipe - The input recipe.
 * @param deps - For `storageStateDir`.
 * @returns The state, or `undefined`.
 */
export async function readSavedState (recipe: InputRecipe, deps: Pick<BootstrapDependencies, 'storageStateDir'>): Promise<StorageState | undefined> {
  const path = recipe.session?.storageStatePath
  if (path === undefined) return undefined

  return JSON.parse(await readFile(resolve(deps.storageStateDir ?? '.', path), 'utf8')) as StorageState
}

/**
 * Runs a recipe's bootstrap steps in a browser session, then captures what
 * `keep` lists and saves it when `saveTo` asks. The session stays open: a
 * remote browser keeps it for the crawl, a local one is closed by the caller.
 *
 * @param recipe - An input recipe with `session.bootstrap`.
 * @param browserSession - Where the steps run.
 * @param deps - Hooks, events, `storageStateDir`.
 * @param captcha - Solves the bootstrap's captchas.
 * @returns The kept state.
 */
export async function runBootstrap (recipe: InputRecipe, browserSession: BrowserSession, deps: Omit<BootstrapDependencies, 'browser'>, captcha?: CaptchaGuard): Promise<StorageState> {
  const bootstrap = recipe.session?.bootstrap
  if (bootstrap === undefined) return { cookies: [], origins: [] }
  const runner = new WebStepRunner(browserSession, recipe, deps.events, new RunGate(1, recipe.limits?.delayMs ?? 0, deps.hosts), captcha)
  const scope = new ExtractionScope()
  scope.set('vars', recipe.vars ?? {})
  scope.set('start', { url: recipe.start[0].url })
  scope.setPage({ url: recipe.start[0].url, number: 1 })
  await runSteps(bootstrap.steps, scope, {
    recipe,
    runner,
    hooks:  deps.hooks,
    events: deps.events,
    onEmit: async () => { throw new Error('a bootstrap produces a session, not records') },
  }, 'session.bootstrap.steps')
  const full = await browserSession.storageState()
  const kept: StorageState = {
    cookies: bootstrap.keep.includes('cookies') ? full.cookies : [],
    origins: bootstrap.keep.includes('localStorage') ? full.origins : [],
  }
  if (bootstrap.saveTo !== undefined) {
    const path = resolve(deps.storageStateDir ?? '.', bootstrap.saveTo)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(kept, null, 2)}\n`)
  }

  return kept
}
