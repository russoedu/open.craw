import { BlockedError } from '../step-flow'

/**
 * A challenge the engine could not get past: the solver failed, the page did
 * not confirm it, or the budget ran out. It is a block, so a recipe with
 * `onBlock.rotate` retries the step on a new access lease (a new IP often
 * means an easier challenge, or none), then the step's error policy applies.
 */
export class CaptchaError extends BlockedError {
  constructor (url: string, readonly kind: string, readonly attempts: number, reason: string) {
    super(url, 0, `captcha (${kind}) ${reason}`)
  }
}
