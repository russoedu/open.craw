import type { ProxyProfile } from './access-profile.contract'

/**
 * Provider presets. Providers all speak plain HTTP proxy with basic auth; they
 * differ in where targeting and session tokens go (username, password, headers)
 * and in whether they intercept HTTPS. A preset is only that knowledge, as
 * templates: adding a provider is adding an entry here, never code.
 *
 * Templates read `params.*` (the profile's parameters, which may themselves
 * read `env.*`), `country` and `session` (absent when the lease is not sticky).
 */
export interface AccessPreset {
  /** One line for docs and error messages. */
  description:    string
  /** `params` the profile must set. */
  requiredParams: string[]
  profile:        Omit<ProxyProfile, 'kind' | 'preset' | 'params'>
}

export const ACCESS_PRESETS: Record<string, AccessPreset> = {
  // Residential, datacenter, ISP, mobile and Web Unlocker zones share one gateway; the zone picks the product.
  // Port 44445 uses the current certificate: the 22225 and 33335 certificates expired on 2026-09-25.
  'brightdata': {
    description:    'Bright Data proxy zones (residential, datacenter, ISP, mobile, Web Unlocker)',
    requiredParams: ['customer', 'zone', 'password'],
    profile:        {
      server:            'https://brd.superproxy.io:44445',
      username:          "brd-customer-{{params.customer}}-zone-{{params.zone}}{{country ? '-country-' + lower(country) : ''}}{{session ? '-session-' + session : ''}}",
      password:          '{{params.password}}',
      ignoreHTTPSErrors: true,
      session:           { idFormat: 'alnum10' },
    },
  },
  'oxylabs-residential': {
    description:    'Oxylabs residential proxies',
    requiredParams: ['user', 'password'],
    profile:        {
      server:   'https://pr.oxylabs.io:7777',
      username: "customer-{{params.user}}{{country ? '-cc-' + upper(country) : ''}}{{session ? '-sessid-' + session + '-sesstime-' + (params.sessionMinutes ?? 10) : ''}}",
      password: '{{params.password}}',
      session:  { idFormat: 'alnum10' },
    },
  },
  'decodo': {
    description:    'Decodo (formerly Smartproxy) residential proxies',
    requiredParams: ['user', 'password'],
    profile:        {
      server:   'https://gate.decodo.com:7000',
      username: "user-{{params.user}}{{country ? '-country-' + lower(country) : ''}}{{session ? '-session-' + session + '-sessionduration-' + (params.sessionMinutes ?? 10) : ''}}",
      password: '{{params.password}}',
      session:  { idFormat: 'alnum10' },
    },
  },
  // IPRoyal puts every option in the password; session ids must be exactly 8 characters.
  'iproyal': {
    description:    'IPRoyal residential proxies',
    requiredParams: ['user', 'password'],
    profile:        {
      server:   'https://geo.iproyal.com:12321',
      username: '{{params.user}}',
      password: "{{params.password}}{{country ? '_country-' + lower(country) : ''}}{{session ? '_session-' + session + '_lifetime-' + (params.lifetime ?? '10m') : ''}}",
      session:  { idFormat: 'alnum8' },
    },
  },
  // Webshare's backbone: a numeric suffix is sticky, `-rotate` rotates.
  'webshare': {
    description:    'Webshare rotating backbone',
    requiredParams: ['user', 'password'],
    profile:        {
      server:   'https://p.webshare.io:80',
      username: "{{params.user}}{{country ? '-' + lower(country) : ''}}{{session ? '-' + session : '-rotate'}}",
      password: '{{params.password}}',
      session:  { idFormat: 'digits4' },
    },
  },
  // Unblockers in proxy mode intercept HTTPS; keep their own rendering off, the browser renders.
  'scrapingbee': {
    description:    'ScrapingBee in proxy mode',
    requiredParams: ['apiKey'],
    profile:        {
      server:            'https://proxy.scrapingbee.com:8886',
      username:          '{{params.apiKey}}',
      password:          "render_js=False{{params.premium ? '&premium_proxy=True' : ''}}{{country ? '&country_code=' + lower(country) : ''}}{{session ? '&session_id=' + session : ''}}",
      ignoreHTTPSErrors: true,
      session:           { idFormat: 'digits6' },
    },
  },
  'zyte': {
    description:    'Zyte API in proxy mode',
    requiredParams: ['apiKey'],
    profile:        {
      server:            'https://api.zyte.com:8011',
      username:          '{{params.apiKey}}',
      password:          '',
      headers:           { 'Zyte-Geolocation': "{{country ? upper(country) : ''}}", 'Zyte-Session-ID': '{{session}}' },
      ignoreHTTPSErrors: true,
      session:           { idFormat: 'hex16' },
    },
  },
}
