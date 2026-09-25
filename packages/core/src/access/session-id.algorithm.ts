import { randomInt } from 'node:crypto'
import { SESSION_ID_FORMAT } from './access-profile.contract'

const ALPHABETS: Record<string, string> = {
  alnum:  'abcdefghijklmnopqrstuvwxyz0123456789',
  digits: '0123456789',
  hex:    '0123456789abcdef',
}

/**
 * A new random session id in a provider's format.
 *
 * @param format - `alnum8`, `digits6`, `hex16`...
 * @returns The id. A `digits` id never starts with 0, so providers that read it as a number keep its length.
 */
export function newSessionId (format = 'alnum10'): string {
  const match = SESSION_ID_FORMAT.exec(format)
  if (match === null) throw new Error(`"${format}" is not a session id format`)
  const alphabet = ALPHABETS[match[1]]
  const length = Number(match[2])
  let id = ''
  for (let index = 0; index < length; index += 1) {
    const from = index === 0 && match[1] === 'digits' ? 1 : 0
    id += alphabet[randomInt(from, alphabet.length)]
  }

  return id
}
