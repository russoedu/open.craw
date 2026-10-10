import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const APP_DIR = join(__dirname, '..')
const RECIPES = join(APP_DIR, '..', '..', 'packages', 'studio', 'e2e', 'recipes-picking')
const SANDBOX_FLAGS = process.env.CI === undefined ? [] : ['--no-sandbox']

/** Where electron-builder's `--dir` build puts the executable on this platform, if it was built. */
function packagedExecutable (): string | undefined {
  const release = join(APP_DIR, 'release')
  const candidates = ((): string[] => {
    if (process.platform === 'win32') return [join(release, 'win-unpacked', 'OpenCraw Studio.exe')]
    if (process.platform === 'linux') return [join(release, 'linux-unpacked', 'opencraw-studio')]
    if (!existsSync(release)) return []

    return readdirSync(release).filter(entry => entry.startsWith('mac')).map(entry => join(release, entry, 'OpenCraw Studio.app', 'Contents', 'MacOS', 'OpenCraw Studio'))
  })()

  return candidates.find(candidate => existsSync(candidate))
}

const executable = packagedExecutable()
const describePackaged = executable === undefined ? describe.skip : describe

/** The installable app itself, not the development layout: it starts with no repository around it. */
describePackaged('studio desktop: packaged app', () => {
  it('starts, serves its UI and opens a folder', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-packaged-recipes-'))
    const userData = mkdtempSync(join(tmpdir(), 'opencraw-packaged-user-'))
    cpSync(RECIPES, folder, { recursive: true })
    const app = await electron.launch({ executablePath: executable, args: [...SANDBOX_FLAGS, `--user-data-dir=${userData}`, folder] })
    try {
      const page = await app.firstWindow()
      await page.getByText('Run sample', { exact: true }).first().waitFor()
      await page.locator('option', { hasText: 'books' }).waitFor({ state: 'attached' })

      expect(new URL(page.url()).searchParams.get('folder')).toBe(folder)
    } finally {
      await app.close()
      rmSync(folder, { recursive: true, force: true })
      rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    }
  })
})
