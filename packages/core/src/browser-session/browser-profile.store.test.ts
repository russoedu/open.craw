import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { BrowserProfiles } from './browser-profile.store'

describe('BrowserProfiles', () => {
  it('keeps each profile in its own directory and refuses names that would leave it', () => {
    const profiles = new BrowserProfiles('/data/profiles')
    expect(profiles.pathOf('shop-1')).toBe(resolve('/data/profiles/shop-1'))
    expect(() => profiles.pathOf('../etc')).toThrow('browser profile "../etc": a name is letters, digits, hyphens and underscores')
    expect(() => profiles.pathOf('a/b')).toThrow('a name is letters')
  })

  it('refuses a profile another live process holds, and takes over one a dead process left', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opencraw-lock-'))
    // A browser that cannot start: the lock must be taken before, and given back after.
    const profiles = new BrowserProfiles(directory, { executablePath: '/nonexistent/chrome' })
    try {
      await mkdir(join(directory, 'busy'))
      await writeFile(join(directory, 'busy', '.opencraw.lock'), String(process.ppid))
      await expect(profiles.open('busy', {}, {})).rejects.toThrow(`browser profile "busy" is open in another browser (${join(directory, 'busy')}, process ${process.ppid})`)
      await mkdir(join(directory, 'stale'))
      await writeFile(join(directory, 'stale', '.opencraw.lock'), '999999999')
      await expect(profiles.open('stale', {}, {})).rejects.toThrow(/nonexistent/)
      await expect(readFile(join(directory, 'stale', '.opencraw.lock'), 'utf8')).rejects.toThrow(/ENOENT/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
