import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import type { BrowserContext } from 'playwright'
import { DEFAULT_BROWSER_CONFIG } from './browser-session.config'
import type { BrowserSessionConfig } from './browser-session.config'
import { applySessionExtras, BrowserSession } from './browser.client'
import type { SessionOptions } from './browser.client'

/** The file that marks a profile as in use, holding the owning process id. */
const LOCK_FILE = '.opencraw.lock'

/** A browser profile name: it becomes a directory, so no separators or dots. */
export const BROWSER_PROFILE_NAME = /^[\w-]+$/

interface Holder {
  owner:   object
  session: BrowserSession
}

/**
 * Browser profiles that persist between runs: each is a directory of a real
 * browser's user data (cookies, local storage, IndexedDB, cache, service
 * workers), so a login, a consent choice or a site's trust in a returning
 * visitor carries over to the next run. The browser equivalent of a user who
 * never clears their history.
 *
 * A profile directory can be open in one browser at a time. Within this
 * crawler, a second use waits for the first to close; the same owner (one
 * recipe run reopening after a rotation) takes it over instead. Another
 * crawler holding it, in this process or another, is reported, not waited
 * for: a lock file in the profile names the process, and one left by a
 * process that died is taken over. (Chromium's own profile lock is not
 * enough: headless builds do not take it.)
 */
export class BrowserProfiles {
  private readonly held = new Map<string, Holder>()
  private readonly waiting = new Map<string, (() => void)[]>()

  /**
   * @param directory - Where the profiles live, one subdirectory each.
   * @param config - The crawler's browser settings (type, binary, headless, timeouts).
   */
  constructor (readonly directory: string, private readonly config: BrowserSessionConfig = {}) {}

  private async take (name: string, owner: object): Promise<void> {
    for (;;) {
      const holder = this.held.get(name)
      if (holder === undefined) return
      if (holder.owner === owner) {
        await holder.session.close()
        continue
      }
      await new Promise<void>((resolve) => {
        const queue = this.waiting.get(name) ?? []
        queue.push(resolve)
        this.waiting.set(name, queue)
      })
    }
  }

  private free (name: string): void {
    this.held.delete(name)
    this.waiting.get(name)?.shift()?.()
  }

  private launch (path: string, options: SessionOptions): Promise<BrowserContext> {
    const type = this.config.browserType ?? DEFAULT_BROWSER_CONFIG.browserType
    const launcher = type === 'firefox' ? firefox : (type === 'webkit' ? webkit : chromium)

    return launcher.launchPersistentContext(path, {
      headless:          this.config.headless ?? DEFAULT_BROWSER_CONFIG.headless,
      slowMo:            this.config.slowMo,
      executablePath:    this.config.executablePath,
      proxy:             options.proxy ?? this.config.proxy,
      extraHTTPHeaders:  options.headers,
      userAgent:         options.userAgent,
      viewport:          options.viewport,
      ignoreHTTPSErrors: this.config.ignoreHTTPSErrors === true || options.ignoreHTTPSErrors === true,
    })
  }

  /**
   * The profile's directory.
   *
   * @param name - A profile name.
   * @returns The absolute path.
   */
  pathOf (name: string): string {
    if (!BROWSER_PROFILE_NAME.test(name)) throw new Error(`browser profile "${name}": a name is letters, digits, hyphens and underscores`)

    return resolve(this.directory, name)
  }

  /**
   * Opens a profile in its own browser, waiting while another run of this
   * crawler uses it.
   *
   * @param name - The profile.
   * @param options - Proxy, headers, viewport, cookies to add. `storageState` is ignored: the profile has its own.
   * @param owner - Who opens it; the same owner reopening closes its previous session first.
   * @returns The session; closing it frees the profile.
   */
  async open (name: string, options: SessionOptions, owner: object): Promise<BrowserSession> {
    const path = this.pathOf(name)
    await this.take(name, owner)
    let context: BrowserContext
    let unlock: () => Promise<void> = unlocked
    try {
      await mkdir(path, { recursive: true })
      unlock = await lockProfile(path, name)
      context = await this.launch(path, options)
    } catch (error) {
      await unlock()
      this.free(name)
      const message = error instanceof Error ? error.message : String(error)
      if (/ProcessSingleton|SingletonLock|already in use/i.test(message)) throw new Error(`browser profile "${name}" is open in another browser (${path}); close it or use another profile`, { cause: error })
      throw error
    }
    if (this.config.timeoutMs !== undefined) context.setDefaultTimeout(this.config.timeoutMs)
    await applySessionExtras(context, options)
    const page = context.pages()[0] ?? await context.newPage()
    let closed = false
    const session = new BrowserSession(context, page, async () => {
      if (closed) return
      closed = true
      try {
        await context.close()
      } finally {
        await unlock()
        this.free(name)
      }
    })
    this.held.set(name, { owner, session })

    return session
  }
}

/**
 * Marks a profile as used by this process, refusing one a live process
 * holds and taking over one a dead process left behind.
 *
 * @param path - The profile directory.
 * @param name - The profile name, for the message.
 * @returns The unlock.
 * @throws Error when another crawler holds the profile.
 */
async function lockProfile (path: string, name: string): Promise<() => Promise<void>> {
  const file = join(path, LOCK_FILE)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(file, String(process.pid), { flag: 'wx' })

      return async () => { await rm(file, { force: true }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const holder = Number(await readHolder(file))
      if (Number.isSafeInteger(holder) && holder > 0 && isAlive(holder)) throw new Error(`browser profile "${name}" is open in another browser (${path}, process ${holder}); close it or use another profile`, { cause: error })
      await rm(file, { force: true })
    }
  }
  throw new Error(`browser profile "${name}": cannot lock ${path}`)
}

/** The unlock of a profile that was never locked. */
async function unlocked (): Promise<void> {}

async function readHolder (file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

function isAlive (pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
