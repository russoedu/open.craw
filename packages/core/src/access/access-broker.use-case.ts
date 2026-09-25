import { accessConfigSchema } from './access-profile.contract'
import type { AccessConfig, AccessProfile, PoolProfile, ProxyProfile, ProxySettings } from './access-profile.contract'
import type { AccessLease, AccessPlugin, LeaseRequest } from './access-plugin.contract'
import { ACCESS_PRESETS } from './access-preset.store'
import { AccessConfigError } from './access-config.error'
import { renderAccessDeep, renderAccessText, renderHeaders } from './render-access.mapper'
import type { AccessTemplateContext } from './render-access.mapper'
import { newSessionId } from './session-id.algorithm'

type Env = Record<string, string | undefined>

const DIRECT: AccessLease = { profile: 'direct', kind: 'direct' }

/**
 * Turns the runner's access config into leases: one per recipe run, shared by
 * its bootstrap and its runner, and a new one on every rotation. The config is
 * checked when the broker is built (profiles, presets, their parameters,
 * plugin names); environment variables are checked when a profile is leased,
 * so a config listing several providers only needs the variables of the one in
 * use.
 */
export class AccessBroker {
  private readonly config: AccessConfig
  private readonly plugins = new Map<string, AccessPlugin>()
  private readonly poolCursor = new Map<string, number>()

  /**
   * @param config - The access config; none means every recipe goes direct.
   * @param plugins - Plugins `{ kind: 'plugin' }` profiles may name.
   * @param env - Where `{{env.X}}` reads from; the process environment by default.
   * @throws AccessConfigError when the config cannot work.
   */
  constructor (config?: unknown, plugins: readonly AccessPlugin[] = [], private readonly env: Env = process.env) {
    const parsed = accessConfigSchema.safeParse(config ?? { profiles: {} })
    if (!parsed.success) throw new AccessConfigError(`invalid access config: ${parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`)
    this.config = parsed.data
    for (const plugin of plugins) this.plugins.set(plugin.name, plugin)
    const registered = plugins.map(plugin => plugin.name)
    for (const [name, profile] of Object.entries(this.config.profiles)) checkProfile(name, profile, registered)
  }

  /** The profile names, for messages and tools. */
  get profileNames (): string[] {
    return Object.keys(this.config.profiles)
  }

  /**
   * A lease for one recipe run.
   *
   * @param request - The recipe, the profile it asks for, country and stickiness.
   * @returns How the run reaches the network.
   * @throws AccessConfigError for an unknown profile or a missing environment variable.
   */
  async lease (request: LeaseRequest): Promise<AccessLease> {
    const name = request.profile ?? this.config.default
    if (name === undefined || (name === 'direct' && this.config.profiles.direct === undefined)) return DIRECT
    const profile = this.config.profiles[name]
    if (profile === undefined) throw new AccessConfigError(`recipe "${request.recipeId}" asks for access profile "${name}", but the access config has ${this.profileNames.length === 0 ? 'no profiles' : `only ${this.profileNames.map(known => `"${known}"`).join(', ')}`}`)
    switch (profile.kind) {
      case 'direct': { return { ...DIRECT, profile: name }
      }
      case 'proxy': { return leaseProxy(name, profile, request, this.env)
      }
      case 'pool': {
        const cursor = this.poolCursor.get(name) ?? 0
        this.poolCursor.set(name, cursor + 1)

        return leasePool(name, profile, request, this.env, cursor)
      }
      case 'plugin': {
        const plugin = this.plugins.get(profile.name) as AccessPlugin
        const context: AccessTemplateContext = { env: this.env, country: request.country, recipe: { id: request.recipeId } }
        const options = renderAccessDeep(profile.options ?? {}, context, `access profile "${name}" options`) as Record<string, unknown>
        const lease = await plugin.lease({ ...request, profile: name, options, attempt: request.attempt ?? 1 })

        return { ...lease, profile: name, kind: `plugin:${profile.name}` }
      }
    }
  }
}

function leaseProxy (name: string, profile: ProxyProfile, request: LeaseRequest, env: Env): AccessLease {
  const merged = withPreset(profile)
  const where = `access profile "${name}"`
  const base: AccessTemplateContext = { env, country: request.country, recipe: { id: request.recipeId } }
  const params = Object.fromEntries(Object.entries(profile.params ?? {}).map(([key, value]) => [key, renderAccessText(value, base, `${where} params.${key}`)]))
  const sticky = request.sticky ?? merged.session?.rotate !== 'per-request'
  const session = sticky ? newSessionId(merged.session?.idFormat) : undefined
  const context: AccessTemplateContext = { ...base, params, session }
  const proxy: ProxySettings = {
    server:   renderAccessText(merged.server ?? '', context, `${where} server`),
    username: optionalText(merged.username, context, `${where} username`),
    password: optionalText(merged.password, context, `${where} password`),
    bypass:   merged.bypass,
  }

  return { profile: name, kind: 'proxy', proxy, session, headers: renderHeaders(merged.headers, context, `${where} headers`), ignoreHTTPSErrors: merged.ignoreHTTPSErrors, blockResources: merged.blockResources }
}

function leasePool (name: string, profile: PoolProfile, request: LeaseRequest, env: Env, cursor: number): AccessLease {
  const index = profile.rotate === 'random' ? Math.floor(Math.random() * profile.proxies.length) : cursor % profile.proxies.length
  const entry = profile.proxies[index]
  const where = `access profile "${name}" proxies[${index}]`
  const context: AccessTemplateContext = { env, country: request.country, recipe: { id: request.recipeId } }
  const proxy: ProxySettings = {
    server:   renderAccessText(entry.server, context, `${where}.server`),
    username: optionalText(entry.username, context, `${where}.username`),
    password: optionalText(entry.password, context, `${where}.password`),
    bypass:   entry.bypass,
  }

  return { profile: name, kind: 'pool', proxy, session: String(index), headers: renderHeaders(profile.headers, context, `access profile "${name}" headers`), ignoreHTTPSErrors: profile.ignoreHTTPSErrors, blockResources: profile.blockResources }
}

/** Load-time checks that do not need the environment. */
function checkProfile (name: string, profile: AccessProfile, plugins: readonly string[]): void {
  const where = `access profile "${name}"`
  if (profile.kind === 'plugin' && !plugins.includes(profile.name)) {
    throw new AccessConfigError(`${where} uses plugin "${profile.name}", which is not registered (registered: ${plugins.join(', ') || 'none'})`)
  }
  if (profile.kind === 'proxy') {
    if (profile.preset !== undefined) {
      const preset = ACCESS_PRESETS[profile.preset]
      if (preset === undefined) throw new AccessConfigError(`${where} uses preset "${profile.preset}", which does not exist (presets: ${Object.keys(ACCESS_PRESETS).join(', ')})`)
      const missing = preset.requiredParams.filter(param => profile.params?.[param] === undefined)
      if (missing.length > 0) throw new AccessConfigError(`${where}: preset "${profile.preset}" needs params ${missing.join(', ')}`)
    }
    checkServer(withPreset(profile), where)
  } else if (profile.kind === 'pool') {
    for (const [index, entry] of profile.proxies.entries()) checkServer(entry, `${where} proxies[${index}]`)
  }
}

/** The profile with its preset underneath: explicit fields win, headers merge. */
function withPreset (profile: ProxyProfile): ProxyProfile {
  if (profile.preset === undefined) return profile
  const preset = ACCESS_PRESETS[profile.preset].profile
  const defined = Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined))

  return { ...preset, ...defined, headers: { ...preset.headers, ...profile.headers }, session: { ...preset.session, ...profile.session } } as ProxyProfile
}

/** Chromium never sends SOCKS5 credentials (microsoft/playwright#10567), so an authenticated SOCKS proxy would fail on every page. */
function checkServer (proxy: { server?: string, username?: string }, where: string): void {
  if (proxy.server?.startsWith('socks') === true && proxy.username !== undefined) {
    throw new AccessConfigError(`${where}: SOCKS proxies cannot take a username and password in a browser; use the provider's HTTP endpoint or IP allow-listing`)
  }
}

function optionalText (template: string | undefined, context: AccessTemplateContext, where: string): string | undefined {
  return template === undefined ? undefined : renderAccessText(template, context, where)
}
