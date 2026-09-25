import { z } from 'zod'

/**
 * Where a crawl's traffic goes. Profiles live in the runner's access config,
 * never in a recipe: they hold the user's accounts. Every string may use
 * `{{ }}` templates over `env.*` (the process environment), `params.*` (the
 * profile's own parameters), `session`, `country` and `recipe.id`.
 */

/** A proxy in Playwright's shape; used for browser contexts and HTTP request contexts alike. */
export interface ProxySettings {
  server:    string
  username?: string
  password?: string
  /** Comma-separated hosts that skip the proxy. */
  bypass?:   string
}

/** Resource types a page may skip loading, to save bandwidth on per-GB proxies. */
export const BLOCKABLE_RESOURCES = ['image', 'media', 'font', 'stylesheet', 'script', 'texttrack', 'xhr', 'fetch', 'eventsource', 'websocket', 'manifest', 'other'] as const
export type BlockableResource = typeof BLOCKABLE_RESOURCES[number]

/** How a sticky session id is generated: character class and length, such as `alnum8` or `digits6`. */
export const SESSION_ID_FORMAT = /^(alnum|digits|hex)([1-9]\d?)$/

export interface ProxySessionSettings {
  /** Default `alnum10`. Providers constrain it: IPRoyal wants exactly 8 characters, NetNut digits. */
  idFormat?: string
  /** `per-recipe` (default): one sticky session per recipe run. `per-request`: no session id, the provider rotates. */
  rotate?:   'per-recipe' | 'per-request'
}

interface ProfileCommon {
  /** Headers sent with every request: provider controls such as `x-oxylabs-geo-location`. Templates allowed; empty values are dropped. */
  headers?:           Record<string, string>
  /** Needed by providers that intercept HTTPS (unblockers, Bright Data residential). */
  ignoreHTTPSErrors?: boolean
  /** Resource types pages skip (web mode). */
  blockResources?:    BlockableResource[]
}

export interface DirectProfile { kind: 'direct' }

export interface ProxyProfile extends ProfileCommon {
  kind:      'proxy'
  /** A built-in preset that fills `server`, `username`, `password`, `headers` and defaults; explicit fields override it. */
  preset?:   string
  /** Values the preset's templates read as `params.*`. */
  params?:   Record<string, string>
  server?:   string
  username?: string
  password?: string
  bypass?:   string
  session?:  ProxySessionSettings
}

export interface PoolProfile extends ProfileCommon {
  kind:    'pool'
  proxies: ProxySettings[]
  /** Default `round-robin`. The pool advances per lease: per recipe run, and on every rotation. */
  rotate?: 'round-robin' | 'random'
}

/**
 * A remote browser reached over the Chrome DevTools Protocol (Bright Data
 * Browser API, Browserless, Oxylabs, Zyte...): web recipes and bootstraps run
 * in it, and it handles IPs, fingerprints and challenges. Api recipes cannot
 * use it.
 */
export interface CdpProfile {
  kind:            'cdp'
  /** `wss://...` or `http://host:port`; a template, usually carrying the token or credentials. */
  endpoint:        string
  /** Headers sent with the connection, such as `Authorization`. Templates. */
  headers?:        Record<string, string>
  params?:         Record<string, string>
  session?:        { idFormat?: string }
  blockResources?: BlockableResource[]
}

export interface PluginProfile {
  kind:     'plugin'
  /** The name an `AccessPlugin` was registered under. */
  name:     string
  /** Passed to the plugin with every string rendered. */
  options?: Record<string, unknown>
}

export type AccessProfile = DirectProfile | ProxyProfile | PoolProfile | CdpProfile | PluginProfile

/** The runner's access config: named profiles and the one used when a recipe names none. */
export interface AccessConfig {
  $schema?: string
  profiles: Record<string, AccessProfile>
  default?: string
}

const templated = z.string()
const stringMap = z.record(z.string(), z.string())
const blockResources = z.array(z.enum(BLOCKABLE_RESOURCES))

const proxySettingsSchema: z.ZodType<ProxySettings> = z.strictObject({
  server:   z.string().min(1),
  username: templated.optional(),
  password: templated.optional(),
  bypass:   z.string().optional(),
})

const sessionSchema: z.ZodType<ProxySessionSettings> = z.strictObject({
  idFormat: z.string().regex(SESSION_ID_FORMAT, 'a session id format is alnum, digits or hex followed by a length, such as alnum8').optional(),
  rotate:   z.enum(['per-recipe', 'per-request']).optional(),
})

const common = { headers: stringMap.optional(), ignoreHTTPSErrors: z.boolean().optional(), blockResources: blockResources.optional() }

const directSchema = z.strictObject({ kind: z.literal('direct') })
const proxySchema = z.strictObject({
  ...common,
  kind:     z.literal('proxy'),
  preset:   z.string().min(1).optional(),
  params:   stringMap.optional(),
  server:   z.string().min(1).optional(),
  username: templated.optional(),
  password: templated.optional(),
  bypass:   z.string().optional(),
  session:  sessionSchema.optional(),
}).refine(profile => profile.preset !== undefined || profile.server !== undefined, 'a proxy profile needs a server or a preset')
const poolSchema = z.strictObject({
  ...common,
  kind:    z.literal('pool'),
  proxies: z.array(proxySettingsSchema).min(1),
  rotate:  z.enum(['round-robin', 'random']).optional(),
})
const cdpSchema = z.strictObject({
  kind:           z.literal('cdp'),
  endpoint:       z.string().min(1),
  headers:        stringMap.optional(),
  params:         stringMap.optional(),
  session:        z.strictObject({ idFormat: z.string().regex(SESSION_ID_FORMAT).optional() }).optional(),
  blockResources: blockResources.optional(),
})
const pluginSchema = z.strictObject({ kind: z.literal('plugin'), name: z.string().min(1), options: z.record(z.string(), z.unknown()).optional() })

export const accessProfileSchema: z.ZodType<AccessProfile> = z.union([directSchema, proxySchema, poolSchema, cdpSchema, pluginSchema])

export const accessConfigSchema: z.ZodType<AccessConfig> = z.strictObject({
  $schema:  z.string().optional(),
  profiles: z.record(z.string().regex(/^[\w-]+$/, 'a profile name is letters, digits, hyphens and underscores'), accessProfileSchema),
  default:  z.string().optional(),
}).refine(config => config.default === undefined || Object.hasOwn(config.profiles, config.default), { message: 'default names a profile that does not exist', path: ['default'] })
