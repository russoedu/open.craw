# Captchas

A captcha is the site asking whether a human is there. OpenCraw can hand the question to a **solver** you
register (usually a paid service) and carry on once the page accepts the answer. The engine does the parts
that are the same for every service: finding the challenge, checking the answer worked, retrying, rotating the
IP, and capping what a run may spend. The solver does one thing: get past one challenge on the live page.

Think of the engine as the driver and the solver as the passenger with the toll money: the driver spots the
toll gate, stops, and only drives on once the barrier is up. The passenger pays.

The recipe reference is [authoring §6.1](authoring.md#61-captcha-solvers). This page is the why and the how.

## First: should you?

Solving a captcha can break the site's terms of service, and in some places it matters legally. Before adding
a solver:

- **Look for the data another way.** An official API, a bulk export, a feed, a partner agreement.
  [authoring §9](authoring.md#9-method-how-to-write-a-recipe-for-a-new-site) finds JSON the page loads
  anyway, which often skips the page that shows the captcha.
- **Slow down first.** Many challenges only appear under load: `limits.delayMs` and a residential proxy
  (`session.access`, [access.md](access.md)) often make them go away.
- **Log in, if the data is behind an account.** A `session.bootstrap` login, solved once and saved with
  `saveTo`, costs one solve instead of one per page.

## The three places a challenge appears

| Where | Recipe | What the engine does |
|---|---|---|
| After a navigation, click or key press | `session.captcha` | Looks for a visible widget after every `goto`, `click`, `press` and pagination click, and solves it before the next step. |
| As the block page itself (a 403 with a challenge) | `session.onBlock: { solve: true }` | A block whose page shows a widget is solved instead of failing; with `rotate: true` too, rotation is the fallback. |
| At one known point (a login form, an invisible reCAPTCHA v3) | a `captcha` step | Solves whatever challenge is on the page, v3 included; none is fine. |

```json
{
  "session": {
    "captcha": { "solver": "capsolver", "verify": { "selector": "#results" }, "attempts": 2, "maxSolves": 5 },
    "onBlock": { "solve": true, "rotate": true, "attempts": 2 }
  },
  "steps": [
    { "type": "goto", "url": "https://shop.example/search?q={{vars.q}}" },
    { "type": "extract", "id": "items", "selector": "#results .item", "kind": "css", "many": true }
  ]
}
```

## What a solve looks like

```text
  ⇢ page 1  https://shop.example/search?q=pandina  [403]
  ⚿ captcha recaptcha-v2 on https://shop.example/search?q=pandina
  ✗ captcha attempt 1 failed: the page still shows the challenge
  ✓ captcha solved by capsolver (attempt 2, 21480 ms)
  · steps.0  goto  23105 ms
```

1. **Detect.** The first *visible* match of `detect.selector` (default: `.g-recaptcha`, `.h-captcha`,
   `.cf-turnstile` and their iframes). The solver gets `kind`, `url`, `siteKey`, `action` and a `selector`.
2. **Solve.** One attempt spends one of `maxSolves`. The solver has `timeoutMs` (default 2 minutes), then its
   `signal` aborts.
3. **Verify.** The solver's `solved` is only a claim. The engine waits up to 10 s for the challenge to be gone
   (`verify.gone`, default) and for `verify.selector` to appear, if given. A token the site rejects is a
   failed attempt, and the next one starts from what the page shows then.
4. **Give up.** After `attempts` (default 3), the step fails with a `CaptchaError`. That is a block: with
   `onBlock.rotate`, the run takes a new IP, reopens the session and retries the step. A fresh IP often gets an
   easier challenge, or none.

The report counts them: `captchas: { detected, solved, failed }`.

## Money

Every attempt is paid, successful or not, and a detector that matches the wrong element would drain a balance.
Hence `maxSolves` (default 10 per recipe run, rotations and bootstrap included; `0` detects without paying).
When it runs out, the challenge is left unsolved with a `captcha:budget` event, and the step fails.

## Writing a solver

```ts
import type { CaptchaSolver } from '@opencraw/core'

export const mySolver: CaptchaSolver = {
  name: 'my-solver',
  async solve (challenge, { page, lease, attempt, signal, log }) {
    const token = await myService.solve({ kind: challenge.kind, siteKey: challenge.siteKey, url: challenge.url, signal })
    await page.locator('[name="g-recaptcha-response"]').evaluate((field, value) => { field.value = value }, token)
    await page.locator('form').first().evaluate(form => form.submit())
    return { status: 'solved' }
  },
}
```

- **Apply the answer yourself.** Put the token where the widget would (`g-recaptcha-response`,
  `cf-turnstile-response`), then run the widget's `data-callback` or submit its form. The engine does not know
  how each site consumes the token.
- **Throw or return `failed`** with a reason: both count as a failed attempt, and the reason reaches the trace.
- **Honour `signal`.** Stop polling your service when it aborts.
- **Use `lease` when the service accepts a proxy**: tokens are often tied to the IP that asked for them.

[`examples/captcha-solver/capsolver.mjs`](../../examples/captcha-solver/capsolver.mjs) is a complete solver for
CapSolver: reCAPTCHA v2 and v3, Turnstile and image captchas, with tests against a faked API.

## Api recipes

An api recipe has no page to solve on. With `session.captcha`, a fetched page that shows a widget fails as a
block that says so. Put the part that meets the captcha in `session.bootstrap` (a browser), keep the cookies,
and let the requests reuse them.
