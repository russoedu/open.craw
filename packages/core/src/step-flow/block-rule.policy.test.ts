import { detectBlock } from './block-rule.policy'
import { BlockedError } from './blocked.error'

const response = (status: number, headers: Record<string, string> = {}, body = ''): Parameters<typeof detectBlock>[0] => ({ url: 'https://x/', status, headers, text: async () => body })

describe('detectBlock', () => {
  it('flags 403, 429 and the AWS WAF challenge by default, and nothing else', async () => {
    await expect(detectBlock(response(403))).resolves.toMatchObject({ reason: 'HTTP 403', status: 403, url: 'https://x/' })
    await expect(detectBlock(response(429))).resolves.toBeInstanceOf(BlockedError)
    await expect(detectBlock(response(202, { 'x-amzn-waf-action': 'challenge' }))).resolves.toMatchObject({ reason: 'x-amzn-waf-action: challenge' })
    await expect(detectBlock(response(200))).resolves.toBeUndefined()
    await expect(detectBlock(response(404))).resolves.toBeUndefined()
    await expect(detectBlock(response(200, {}, 'Access Denied'))).resolves.toBeUndefined()
  })

  it('uses a recipe rule instead of the default: statuses, header patterns, body text', async () => {
    const rule = { status: [503], header: { Server: 'AkamaiGHost' }, text: 'access denied|captcha' }
    await expect(detectBlock(response(403), rule)).resolves.toBeUndefined()
    await expect(detectBlock(response(503), rule)).resolves.toMatchObject({ reason: 'HTTP 503' })
    await expect(detectBlock(response(200, { server: 'AkamaiGHost' }), rule)).resolves.toMatchObject({ reason: 'server: AkamaiGHost' })
    await expect(detectBlock(response(200, {}, '<h1>Access Denied</h1>'), rule)).resolves.toMatchObject({ reason: 'body matches /access denied|captcha/i' })
    await expect(detectBlock({ url: 'u', status: 200, headers: {}, text: async () => { throw new Error('no body') } }, rule)).resolves.toBeUndefined()
  })
})
