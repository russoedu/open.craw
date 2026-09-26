import { resolve } from 'node:path'
import { BrowserProfiles } from './browser-profile.store'

describe('BrowserProfiles', () => {
  it('keeps each profile in its own directory and refuses names that would leave it', () => {
    const profiles = new BrowserProfiles('/data/profiles')
    expect(profiles.pathOf('shop-1')).toBe(resolve('/data/profiles/shop-1'))
    expect(() => profiles.pathOf('../etc')).toThrow('browser profile "../etc": a name is letters, digits, hyphens and underscores')
    expect(() => profiles.pathOf('a/b')).toThrow('a name is letters')
  })
})
