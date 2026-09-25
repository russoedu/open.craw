import { AccessBroker } from './access-broker.use-case'
import { AccessConfigError } from './access-config.error'
import type { AccessPlugin } from './access-plugin.contract'

const env = { BRD_CUSTOMER: 'hl_123', BRD_PASSWORD: 'secret', PROXY_PASS: 'p4ss', IPR_USER: 'me', IPR_PASS: 'pw' }

function broker (config: unknown, plugins: AccessPlugin[] = []): AccessBroker {
  return new AccessBroker(config, plugins, env)
}

describe('AccessBroker', () => {
  it('goes direct without a config, a default or a profile', async () => {
    await expect(broker(undefined).lease({ recipeId: 'r' })).resolves.toEqual({ profile: 'direct', kind: 'direct' })
    await expect(broker({ profiles: { p: { kind: 'proxy', server: 'http://h:1' } } }).lease({ recipeId: 'r' })).resolves.toMatchObject({ kind: 'direct' })
  })

  it('renders a raw proxy profile with env, session and country, and uses the default profile', async () => {
    const access = broker({
      profiles: { own: { kind: 'proxy', server: 'http://127.0.0.1:3128', username: "user-{{session}}{{country ? '-cc-' + country : ''}}", password: '{{env.PROXY_PASS}}', session: { idFormat: 'digits8' }, headers: { 'X-Geo': "{{country ? upper(country) : ''}}" } } },
      default:  'own',
    })
    const lease = await access.lease({ recipeId: 'r', country: 'gb' })
    expect(lease).toMatchObject({ profile: 'own', kind: 'proxy', proxy: { server: 'http://127.0.0.1:3128', password: 'p4ss' }, headers: { 'X-Geo': 'GB' } })
    expect(lease.session).toMatch(/^[1-9]\d{7}$/)
    expect(lease.proxy?.username).toBe(`user-${lease.session}-cc-gb`)
    const other = await access.lease({ recipeId: 'r' })
    expect(other.session).not.toBe(lease.session)
    expect(other.headers).toBeUndefined()
  })

  it('leaves the session out when the recipe or the profile is not sticky', async () => {
    const access = broker({ profiles: { own: { kind: 'proxy', server: 'http://h:1', username: "u{{session ? '-s-' + session : ''}}", session: { rotate: 'per-request' } } } })
    await expect(access.lease({ recipeId: 'r', profile: 'own' })).resolves.toMatchObject({ proxy: { username: 'u' }, session: undefined })
    await expect(access.lease({ recipeId: 'r', profile: 'own', sticky: true })).resolves.toMatchObject({ proxy: { username: expect.stringMatching(/^u-s-[a-z0-9]{10}$/) } })
  })

  it('expands presets: Bright Data in the username, IPRoyal in the password', async () => {
    const access = broker({
      profiles: {
        brd:  { kind: 'proxy', preset: 'brightdata', params: { customer: '{{env.BRD_CUSTOMER}}', zone: 'residential', password: '{{env.BRD_PASSWORD}}' } },
        ipr:  { kind: 'proxy', preset: 'iproyal', params: { user: '{{env.IPR_USER}}', password: '{{env.IPR_PASS}}' } },
        zyte: { kind: 'proxy', preset: 'zyte', params: { apiKey: 'k' } },
      },
    })
    const brd = await access.lease({ recipeId: 'r', profile: 'brd', country: 'US' })
    expect(brd.proxy).toEqual({ server: 'https://brd.superproxy.io:44445', username: `brd-customer-hl_123-zone-residential-country-us-session-${brd.session}`, password: 'secret', bypass: undefined })
    expect(brd.ignoreHTTPSErrors).toBe(true)
    const ipr = await access.lease({ recipeId: 'r', profile: 'ipr', country: 'de' })
    expect(ipr.session).toMatch(/^[a-z0-9]{8}$/)
    expect(ipr.proxy).toMatchObject({ username: 'me', password: `pw_country-de_session-${ipr.session}_lifetime-10m` })
    const zyte = await access.lease({ recipeId: 'r', profile: 'zyte' })
    expect(zyte.proxy).toMatchObject({ server: 'https://api.zyte.com:8011', username: 'k', password: '' })
    expect(zyte.headers).toEqual({ 'Zyte-Session-ID': zyte.session })
  })

  it('rotates through a pool', async () => {
    const access = broker({ profiles: { pool: { kind: 'pool', proxies: [{ server: 'http://a:1' }, { server: 'http://b:1', username: 'u', password: '{{env.PROXY_PASS}}' }] } } })
    const servers = []
    for (let index = 0; index < 3; index += 1) {
      const lease = await access.lease({ recipeId: 'r', profile: 'pool' })
      servers.push(lease.proxy?.server)
    }
    expect(servers).toEqual(['http://a:1', 'http://b:1', 'http://a:1'])
  })

  it('hands a plugin its options with every string rendered', async () => {
    const seen: unknown[] = []
    const plugin: AccessPlugin = {
      name:  'remote',
      lease: (request) => {
        seen.push(request)

        return { proxy: { server: String(request.options.url) } }
      },
    }
    const lease = await broker({ profiles: { cloud: { kind: 'plugin', name: 'remote', options: { url: 'http://x/{{env.BRD_CUSTOMER}}', size: 2 } } } }, [plugin]).lease({ recipeId: 'r', profile: 'cloud' })
    expect(lease).toMatchObject({ profile: 'cloud', kind: 'plugin:remote', proxy: { server: 'http://x/hl_123' } })
    expect(seen[0]).toMatchObject({ recipeId: 'r', profile: 'cloud', attempt: 1, options: { url: 'http://x/hl_123', size: 2 } })
  })

  it('refuses configs that cannot work, at construction', () => {
    expect(() => broker({ profiles: { p: { kind: 'proxy' } } })).toThrow('needs a server or a preset')
    expect(() => broker({ profiles: { p: { kind: 'proxy', preset: 'nope' } } })).toThrow('preset "nope", which does not exist')
    expect(() => broker({ profiles: { p: { kind: 'proxy', preset: 'brightdata', params: { zone: 'z' } } } })).toThrow('needs params customer, password')
    expect(() => broker({ profiles: { p: { kind: 'proxy', server: 'socks5://h:1', username: 'u' } } })).toThrow('SOCKS proxies cannot take a username')
    expect(() => broker({ profiles: { p: { kind: 'plugin', name: 'ghost' } } })).toThrow('plugin "ghost", which is not registered')
    expect(() => broker({ profiles: {}, default: 'missing' })).toThrow('default names a profile that does not exist')
    expect(() => broker({ profiles: { p: { kind: 'direct', extra: 1 } } })).toThrow(AccessConfigError)
  })

  it('names the missing environment variable and the unknown profile at lease time', async () => {
    const access = broker({ profiles: { p: { kind: 'proxy', server: 'http://h:1', password: '{{env.NOT_SET}}' } } })
    await expect(access.lease({ recipeId: 'r', profile: 'p' })).rejects.toThrow('access profile "p" password needs the environment variable NOT_SET')
    await expect(access.lease({ recipeId: 'imdb', profile: 'uk' })).rejects.toThrow('recipe "imdb" asks for access profile "uk", but the access config has only "p"')
  })
})
