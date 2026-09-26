import type { InputRecipe } from '../recipe-schema'
import { CaptchaBudget } from './captcha-budget.model'
import { captchaSolverNames } from './captcha-guard.use-case'
import { CaptchaSolverRegistry } from './captcha-solver-registry.store'
import type { CaptchaSolver } from './captcha-solver.contract'
import { CaptchaError } from './captcha.error'
import { BlockedError } from '../step-flow'

const solver = (name: string): CaptchaSolver => ({ name, solve: () => ({ status: 'solved' }) })

describe('CaptchaSolverRegistry', () => {
  it('resolves solvers by name, and names what is registered when one is missing', () => {
    const registry = new CaptchaSolverRegistry([solver('capsolver'), solver('twocaptcha')])
    expect(registry.resolve('capsolver').name).toBe('capsolver')
    expect(registry.names).toEqual(['capsolver', 'twocaptcha'])
    expect(() => registry.resolve('nope')).toThrow('captcha solver "nope" is not registered (registered: capsolver, twocaptcha)')
    expect(() => new CaptchaSolverRegistry().resolve('nope')).toThrow('(registered: none)')
  })

  it('refuses two solvers with one name', () => {
    expect(() => new CaptchaSolverRegistry([solver('a'), solver('a')])).toThrow('two captcha solvers are named "a"')
  })
})

describe('CaptchaBudget', () => {
  it('hands out solves up to its maximum', () => {
    const budget = new CaptchaBudget(2)
    expect([budget.take(), budget.take(), budget.take()]).toEqual([true, true, false])
    expect(budget.spent).toBe(2)
    expect(new CaptchaBudget(0).take()).toBe(false)
  })
})

describe('CaptchaError', () => {
  it('is a block, so onBlock.rotate applies to it', () => {
    const error = new CaptchaError('https://x/', 'hcaptcha', 3, 'not solved after 3 attempts: timeout')
    expect(error).toBeInstanceOf(BlockedError)
    expect(error.message).toBe('blocked at https://x/: captcha (hcaptcha) not solved after 3 attempts: timeout')
  })
})

describe('captchaSolverNames', () => {
  it('collects session.captcha and every captcha step, nested and in the bootstrap', () => {
    const recipe = {
      kind:    'input',
      id:      'r',
      output:  'o',
      mode:    'web',
      start:   [{ url: 'https://x/' }],
      session: { captcha: { solver: 'main' }, bootstrap: { keep: ['cookies'], steps: [{ type: 'captcha', solver: 'login' }] } },
      steps:   [
        { type: 'captcha' },
        { type: 'if', test: 'x', steps: [{ type: 'captcha', solver: 'then' }], else: [{ type: 'forEach', over: 'l', as: 'i', steps: [{ type: 'captcha', solver: 'deep' }] }] },
      ],
      mapping: {},
    } as InputRecipe
    expect(captchaSolverNames(recipe).sort((first, second) => first.localeCompare(second))).toEqual(['deep', 'login', 'main', 'then'])
  })
})
