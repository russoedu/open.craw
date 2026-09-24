import type { Hook, HookMap } from './hook.contract'
import { UnknownHookError } from './hook.error'

/** The hooks a crawler was created with, resolved by name at run time. */
export class HookRegistry {
  private readonly hooks: Record<string, Hook> = {}

  constructor (hooks: HookMap = {}) {
    for (const [name, hook] of Object.entries(hooks)) this.register(name, hook)
  }

  register (name: string, hook: Hook): void {
    this.hooks[name] = hook
  }

  has (name: string): boolean {
    return Object.hasOwn(this.hooks, name)
  }

  names (): string[] {
    return Object.keys(this.hooks)
  }

  /**
   * @param name - The name a recipe used.
   * @returns The hook.
   * @throws UnknownHookError when nothing was registered under that name.
   */
  resolve (name: string): Hook {
    if (!this.has(name)) throw new UnknownHookError(name, this.names())

    return this.hooks[name]
  }
}
