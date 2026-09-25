import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAccess } from './resolve-access.use-case'

async function configFile (): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'access-'))
  const path = join(directory, 'access.json')
  await writeFile(path, JSON.stringify({ profiles: { uk: { kind: 'proxy', server: 'http://h:1' }, us: { kind: 'direct' } }, default: 'us' }))

  return path
}

describe('resolveAccess', () => {
  it('goes direct without a file, and refuses a profile without one', async () => {
    await expect(resolveAccess({ insecureTls: false })).resolves.toBeUndefined()
    await expect(resolveAccess({ insecureTls: false, accessProfile: 'uk' })).rejects.toThrow('--access-profile needs an access config')
  })

  it('loads the file and makes --access-profile its default', async () => {
    const access = await configFile()
    await expect(resolveAccess({ insecureTls: false, access })).resolves.toMatchObject({ default: 'us' })
    await expect(resolveAccess({ insecureTls: false, access, accessProfile: 'uk' })).resolves.toMatchObject({ default: 'uk' })
    await expect(resolveAccess({ insecureTls: false, access, accessProfile: 'fr' })).rejects.toThrow('access profile "fr" is not in')
  })
})
