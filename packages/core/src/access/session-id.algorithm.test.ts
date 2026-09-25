import { newSessionId } from './session-id.algorithm'

describe('newSessionId', () => {
  it('generates ids in the requested alphabet and length', () => {
    expect(newSessionId('alnum8')).toMatch(/^[a-z0-9]{8}$/)
    expect(newSessionId('digits6')).toMatch(/^[1-9]\d{5}$/)
    expect(newSessionId('hex16')).toMatch(/^[0-9a-f]{16}$/)
    expect(newSessionId()).toMatch(/^[a-z0-9]{10}$/)
    expect(() => newSessionId('emoji3')).toThrow('not a session id format')
  })
})
