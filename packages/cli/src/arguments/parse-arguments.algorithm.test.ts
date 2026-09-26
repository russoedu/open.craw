import { parseArguments } from './parse-arguments.algorithm'

describe('parseArguments', () => {
  it('reads each command with its options', () => {
    expect(parseArguments([])).toEqual({ name: 'help' })
    expect(parseArguments(['--version'])).toEqual({ name: 'version' })
    expect(parseArguments(['validate', 'a.json', 'dir/'])).toEqual({ name: 'validate', paths: ['a.json', 'dir/'] })
    expect(parseArguments(['run', 'recipes/', '--out', 'x.jsonl', '--append', '--resume', '--only', 'a', '--only', 'b', '--dry-run', '--trace'], { OPENCRAW_INSECURE_TLS: '1' })).toEqual({
      name:     'run',
      paths:    ['recipes/'],
      out:      'x.jsonl',
      append:   true,
      resume:   true,
      trace:    true,
      dryRun:   true,
      only:     ['a', 'b'],
      headed:   false,
      profiles: undefined,
      retries:  undefined,
      throttle: { delayMs: undefined, concurrency: undefined },
      options:  { browserPath: undefined, insecureTls: true, userAgent: undefined, access: undefined, accessProfile: undefined, plugins: undefined },
    })
    expect(parseArguments(['probe', 'https://x', '--browser', '--browser-path', '/c', '--user-agent', 'ua'])).toEqual({
      name: 'probe', url: 'https://x', browser: true, options: { browserPath: '/c', insecureTls: false, userAgent: 'ua', access: undefined, accessProfile: undefined, plugins: undefined },
    })
    expect(parseArguments(['probe', 'https://x'], { OPENCRAW_CHROMIUM: '/env' })).toMatchObject({ options: { browserPath: '/env' } })
    expect(parseArguments(['run', 'r/', '--access', 'a.json', '--access-profile', 'uk'])).toMatchObject({ options: { access: 'a.json', accessProfile: 'uk' } })
    expect(parseArguments(['run', 'r/'], { OPENCRAW_ACCESS: 'env.json' })).toMatchObject({ options: { access: 'env.json' } })
    expect(parseArguments(['run', 'r/', '--hooks', 'h.mjs'], { OPENCRAW_HOOKS: 'env.mjs' })).toMatchObject({ options: { plugins: 'h.mjs' } })
    expect(parseArguments(['run', 'r/', '--plugins', 'p.mjs', '--hooks', 'h.mjs'])).toMatchObject({ options: { plugins: 'p.mjs' } })
    expect(parseArguments(['run', 'r/'], { OPENCRAW_HOOKS: 'env.mjs' })).toMatchObject({ options: { plugins: 'env.mjs' } })
    expect(parseArguments(['probe', 'https://x'], { OPENCRAW_PLUGINS: 'p.mjs', OPENCRAW_HOOKS: 'h.mjs' })).toMatchObject({ options: { plugins: 'p.mjs' } })
    expect(parseArguments(['run', 'r/'], { OPENCRAW_PLUGINS: '', OPENCRAW_HOOKS: '' })).toMatchObject({ options: { plugins: undefined } })
    expect(parseArguments(['run', 'r/', '--host-delay', '500', '--host-concurrency', '2'])).toMatchObject({ throttle: { delayMs: 500, concurrency: 2 } })
    expect(parseArguments(['run', 'r/'], { OPENCRAW_PROFILES: '/p' })).toMatchObject({ profiles: '/p' })
    expect(parseArguments(['run', 'r/', '--retries', '1'])).toMatchObject({ retries: 1 })
    expect(parseArguments(['run', 'r/', '--profiles', 'here'], { OPENCRAW_PROFILES: '/p' })).toMatchObject({ profiles: 'here' })
  })

  it('rejects what makes no sense', () => {
    expect(() => parseArguments(['fly'])).toThrow('unknown command "fly"')
    expect(() => parseArguments(['validate'])).toThrow('at least one')
    expect(() => parseArguments(['run', 'a', '--resume', '--out', 'x'])).toThrow('--resume needs --append')
    expect(() => parseArguments(['run', 'a', '--append'])).toThrow('need --out')
    expect(() => parseArguments(['probe'])).toThrow('exactly one URL')
    expect(() => parseArguments(['run', 'a', '--bogus'])).toThrow(/Unknown option/)
    expect(() => parseArguments(['run', 'a', '--host-concurrency', '0'])).toThrow('--host-concurrency needs a whole number of at least 1, not "0"')
    expect(() => parseArguments(['run', 'a', '--host-delay', 'soon'])).toThrow('--host-delay needs a whole number')
  })
})
