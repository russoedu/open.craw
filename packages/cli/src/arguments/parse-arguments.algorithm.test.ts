import { parseArguments } from './parse-arguments.algorithm'

describe('parseArguments', () => {
  it('reads each command with its options', () => {
    expect(parseArguments([])).toEqual({ name: 'help' })
    expect(parseArguments(['--version'])).toEqual({ name: 'version' })
    expect(parseArguments(['validate', 'a.json', 'dir/'])).toEqual({ name: 'validate', paths: ['a.json', 'dir/'] })
    expect(parseArguments(['run', 'recipes/', '--out', 'x.jsonl', '--append', '--resume', '--only', 'a', '--only', 'b', '--dry-run', '--trace'], { OPEN_CRAW_INSECURE_TLS: '1' })).toEqual({
      name:    'run',
      paths:   ['recipes/'],
      out:     'x.jsonl',
      append:  true,
      resume:  true,
      trace:   true,
      dryRun:  true,
      only:    ['a', 'b'],
      headed:  false,
      options: { browserPath: undefined, insecureTls: true, userAgent: undefined, access: undefined, accessProfile: undefined },
    })
    expect(parseArguments(['probe', 'https://x', '--browser', '--browser-path', '/c', '--user-agent', 'ua'])).toEqual({
      name: 'probe', url: 'https://x', browser: true, options: { browserPath: '/c', insecureTls: false, userAgent: 'ua', access: undefined, accessProfile: undefined },
    })
    expect(parseArguments(['probe', 'https://x'], { OPEN_CRAW_CHROMIUM: '/env' })).toMatchObject({ options: { browserPath: '/env' } })
    expect(parseArguments(['run', 'r/', '--access', 'a.json', '--access-profile', 'uk'])).toMatchObject({ options: { access: 'a.json', accessProfile: 'uk' } })
    expect(parseArguments(['run', 'r/'], { OPEN_CRAW_ACCESS: 'env.json' })).toMatchObject({ options: { access: 'env.json' } })
  })

  it('rejects what makes no sense', () => {
    expect(() => parseArguments(['fly'])).toThrow('unknown command "fly"')
    expect(() => parseArguments(['validate'])).toThrow('at least one')
    expect(() => parseArguments(['run', 'a', '--resume', '--out', 'x'])).toThrow('--resume needs --append')
    expect(() => parseArguments(['run', 'a', '--append'])).toThrow('need --out')
    expect(() => parseArguments(['probe'])).toThrow('exactly one URL')
    expect(() => parseArguments(['run', 'a', '--bogus'])).toThrow(/Unknown option/)
  })
})
