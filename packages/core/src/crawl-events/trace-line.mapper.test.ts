import { depthOf, traceLine } from './trace-line.mapper'

const at = '2026-01-01T00:00:00.000Z'

describe('traceLine', () => {
  it('indents steps by their depth in the tree and names them by type and id', () => {
    expect(traceLine({ type: 'step:finish', at, recipeId: 'r', stepType: 'extract', stepId: 'actor_name', path: 'steps.3', durationMs: 4 })).toBe('  · steps.3  extract actor_name  4 ms')
    expect(traceLine({ type: 'step:finish', at, recipeId: 'r', stepType: 'extract', path: 'steps.8.steps.2', durationMs: 1 })).toBe('    · steps.8.steps.2  extract  1 ms')
    expect(traceLine({ type: 'step:skip', at, recipeId: 'r', stepType: 'extract', stepId: 'year', path: 'steps.8.steps.2', error: 'no match for td.year' })).toBe('    ↷ steps.8.steps.2  extract year  skipped: no match for td.year')
    expect(traceLine({ type: 'step:start', at, recipeId: 'r', stepType: 'goto', path: 'steps.0' })).toBeUndefined()
  })

  it('shows the access lease without credentials', () => {
    expect(traceLine({ type: 'access:lease', at, recipeId: 'r', profile: 'residential', kind: 'proxy', server: 'https://brd.superproxy.io:44445', session: 'abc' })).toBe('  ⇄ access residential (proxy https://brd.superproxy.io:44445, session abc)')
    expect(traceLine({ type: 'access:lease', at, recipeId: 'r', profile: 'direct', kind: 'direct' })).toBe('  ⇄ access direct (direct)')
  })

  it('shows blocks, rotations and a non-2xx page status', () => {
    expect(traceLine({ type: 'access:blocked', at, recipeId: 'r', url: 'https://x/', status: 403, reason: 'HTTP 403' })).toBe('  ⛔ blocked https://x/: HTTP 403')
    expect(traceLine({ type: 'access:rotate', at, recipeId: 'r', attempt: 2, reason: 'blocked' })).toBe('  ↻ new access lease (attempt 2)')
    expect(traceLine({ type: 'page:visit', at, recipeId: 'r', url: 'https://x/', number: 1, status: 202 })).toBe('  ⇢ page 1  https://x/')
    expect(traceLine({ type: 'page:visit', at, recipeId: 'r', url: 'https://x/', number: 1, status: 403 })).toBe('  ⇢ page 1  https://x/  [403]')
  })

  it('shows captchas met, solved, failed and left for lack of budget', () => {
    expect(traceLine({ type: 'captcha:detected', at, recipeId: 'r', url: 'https://x/', kind: 'turnstile' })).toBe('  ⚿ captcha turnstile on https://x/')
    expect(traceLine({ type: 'captcha:solve', at, recipeId: 'r', url: 'https://x/', kind: 'turnstile', solver: 's', attempt: 1 })).toBeUndefined()
    expect(traceLine({ type: 'captcha:failed', at, recipeId: 'r', url: 'https://x/', kind: 'turnstile', solver: 's', attempt: 1, reason: 'timeout' })).toBe('  ✗ captcha attempt 1 failed: timeout')
    expect(traceLine({ type: 'captcha:solved', at, recipeId: 'r', url: 'https://x/', kind: 'turnstile', solver: 's', attempt: 2, durationMs: 900 })).toBe('  ✓ captcha solved by s (attempt 2, 900 ms)')
    expect(traceLine({ type: 'captcha:budget', at, recipeId: 'r', url: 'https://x/', kind: 'turnstile', max: 10 })).toBe("  ⛔ captcha left unsolved: the run's 10 solves are spent")
  })

  it('shows which branch an if took', () => {
    expect(traceLine({ type: 'step:branch', at, recipeId: 'r', path: 'steps.1', branch: 'then' })).toBe('  ⑂ steps.1  then')
  })

  it('shows pages, records and the recipe summary', () => {
    expect(traceLine({ type: 'recipe:start', at, recipeId: 'tmdb', mode: 'api' })).toBe('▶ tmdb (api)')
    expect(traceLine({ type: 'page:visit', at, recipeId: 'r', url: 'https://x/p', number: 2 })).toBe('  ⇢ page 2  https://x/p')
    expect(traceLine({ type: 'record:emit', at, recipeId: 'r', url: 'https://x/p', key: '["a","b"]', data: {} })).toBe('  ✚ record ["a","b"]')
    expect(traceLine({ type: 'record:reject', at, recipeId: 'r', url: 'https://x/p', field: 'title', reason: 'missing' })).toBe('  ✖ record rejected: title: missing')
    expect(traceLine({ type: 'recipe:finish', at, recipeId: 'tmdb', emitted: 10, rejected: 0, duplicates: 0, skipped: 0, pages: 2, durationMs: 3006 })).toBe('■ tmdb: 10 emitted, 0 rejected, 0 duplicates, 2 pages, 3006 ms')
    expect(traceLine({ type: 'recipe:finish', at, recipeId: 'tmdb', emitted: 0, rejected: 0, duplicates: 0, skipped: 10, pages: 2, durationMs: 12 })).toBe('■ tmdb: 0 emitted, 0 rejected, 0 duplicates, 10 skipped, 2 pages, 12 ms')
    expect(traceLine({ type: 'recipe:finish', at, recipeId: 'it', emitted: 9, rejected: 0, duplicates: 0, skipped: 0, stepsSkipped: 1, pages: 8, durationMs: 12 })).toBe('■ it: 9 emitted, 0 rejected, 0 duplicates, 1 steps skipped, 8 pages, 12 ms')
    expect(traceLine({ type: 'record:skipped', at, recipeId: 'tmdb', url: 'u', key: '["u"]' })).toBe('  ⤼ skipped ["u"]')
    expect(traceLine({ type: 'recipe:finish', at, recipeId: 'imdb', emitted: 0, rejected: 0, duplicates: 0, skipped: 0, pages: 1, durationMs: 9, error: 'step steps.1 (wait) failed' })).toContain('✖ stopped: step steps.1 (wait) failed')
  })

  it('computes depth from the path', () => {
    expect(depthOf('steps.0')).toBe(1)
    expect(depthOf('steps.8.steps.2')).toBe(2)
    expect(depthOf('session.bootstrap.steps.1')).toBe(1)
    expect(depthOf('steps.1.steps.0')).toBe(2)
    expect(depthOf('steps.1.else.0.steps.3')).toBe(3)
  })
})
