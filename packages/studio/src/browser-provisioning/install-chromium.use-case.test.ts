const failingInstall = async (): Promise<void> => { throw new Error('network down') }
const succeedingInstall = async (): Promise<void> => {}

describe('installChromiumOnce', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('dedupes concurrent calls into a single run', async () => {
    const { installChromiumOnce } = await import('./install-chromium.use-case')
    let calls = 0
    const run = async (): Promise<void> => { calls++ }

    await Promise.all([installChromiumOnce(run), installChromiumOnce(run)])

    expect(calls).toBe(1)
  })

  it('memoizes a successful install: a later call does not run again', async () => {
    const { installChromiumOnce } = await import('./install-chromium.use-case')
    let calls = 0
    const run = async (): Promise<void> => { calls++ }

    await installChromiumOnce(run)
    await installChromiumOnce(run)

    expect(calls).toBe(1)
  })

  it('clears the memo on failure, so the next call retries', async () => {
    const { installChromiumOnce } = await import('./install-chromium.use-case')

    await expect(installChromiumOnce(failingInstall)).rejects.toThrow('network down')
    await expect(installChromiumOnce(succeedingInstall)).resolves.toBeUndefined()
  })
})

describe('installInvocation', () => {
  it('runs Playwright\'s CLI with the current executable as a Node, also when that executable is Electron', async () => {
    const { installInvocation } = await import('./install-chromium.use-case')
    const { file, args, env } = installInvocation('/app/node_modules/playwright/cli.js')

    expect(file).toBe(process.execPath)
    expect(args).toEqual(['/app/node_modules/playwright/cli.js', 'install', 'chromium'])
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
  })
})
