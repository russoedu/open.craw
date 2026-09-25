import { HookRegistry } from './hook-registry.store'
import { UnknownHookError } from './hook.error'

const positive = (input: unknown): boolean => Number(input) > 0

describe('HookRegistry', () => {
  it('resolves registered hooks by name', () => {
    const registry = new HookRegistry({ positive })
    expect(registry.resolve('positive')).toBe(positive)
    expect(registry.has('positive')).toBe(true)
    expect(registry.names()).toEqual(['positive'])
  })

  it('names the known hooks when one is missing', () => {
    const registry = new HookRegistry({ a: () => 1 })
    expect(() => registry.resolve('b')).toThrow(UnknownHookError)
    expect(() => registry.resolve('b')).toThrow('registered: a')
    expect(() => new HookRegistry().resolve('b')).toThrow('no hooks registered')
  })
})
