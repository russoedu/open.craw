import type { BlockableResource, ProxySettings } from './access-profile.contract'

/** What a recipe run asks the access layer for. */
export interface LeaseRequest {
  recipeId: string
  /** The profile to use; the config's default when omitted, `direct` when there is none. */
  profile?: string
  /** ISO country code the recipe wants its traffic to come from. */
  country?: string
  /** Overrides the profile's `session.rotate`: `true` keeps one IP for the run, `false` lets the provider rotate. */
  sticky?:  boolean
  /** 1 for the first lease of a run, higher after a rotation. */
  attempt?: number
}

/** How one recipe run reaches the network: applied to its browser context, its HTTP context and its bootstrap alike. */
export interface AccessLease {
  profile:            string
  kind:               string
  proxy?:             ProxySettings
  /** The sticky session id, when the lease has one. */
  session?:           string
  headers?:           Record<string, string>
  ignoreHTTPSErrors?: boolean
  blockResources?:    BlockableResource[]
  /** A remote browser to connect to instead of launching one (web recipes and bootstraps only). */
  cdp?:               { endpoint: string, headers?: Record<string, string> }
  /** Called when the run ends or rotates away from this lease. */
  release?:           () => Promise<void>
}

/** What a plugin receives: the request plus its profile's options, every string rendered. */
export interface PluginLeaseRequest extends LeaseRequest {
  profile: string
  options: Record<string, unknown>
  attempt: number
}

/**
 * The extension point for access that config cannot express: a remote browser
 * whose URL comes from a REST call, a proxy list fetched from an API, a
 * rotating credential. Registered on the crawler, referenced by name from a
 * `{ kind: 'plugin', name }` profile.
 */
export interface AccessPlugin {
  name:  string
  lease: (request: PluginLeaseRequest) => Promise<Omit<AccessLease, 'profile' | 'kind'>> | Omit<AccessLease, 'profile' | 'kind'>
}
