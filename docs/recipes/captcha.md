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
| In a form, checked only when the form is posted (an image code) | a `captcha` step with `image` | The solver fills the answer, the step's `submit` posts the form, the page says yes or no. [Below](#form-captchas-checked-when-the-form-is-posted). |

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

## Form captchas: checked when the form is posted

Some sites have no "check" for their captcha: it is a code drawn as an image, a text field, and the form's
own button. Whether the code was right is only known once the form is posted and the page comes back, with
the result or with "Invalid CAPTCHA." and a new image. The public Vahan registrations report works this way,
and so does this step:

```json
{ "type": "captcha", "solver": "tesseract",
  "image":   "#captchaImage",
  "refresh": "#captchaImg",
  "field":   "#externalCaptcha",
  "submit":  [ { "type": "click", "selector": "#applyTrigger" } ],
  "verify":  { "selector": "#makerDynamicReportHeader", "failure": "#captchaMsg", "timeoutMs": 30000 },
  "attempts": 5 }
```

Put it after the steps that fill the form. Each attempt:

1. **The solver does its part.** It gets the image (`challenge.selector`), the answer field (`challenge.field`)
   and the refresh control (`challenge.refresh`). A reader reads the image, clicks refresh when it is unsure
   (that costs nothing: no form is posted), and fills the field.
2. **The engine runs `submit`**: the button, or the fills a form that empties itself after a wrong code needs
   first. Clicks, fills, key presses, selects, waits and scripts; each may have a `when`.
3. **The page answers.** `verify.selector` showing is a yes. `verify.failure` showing is a no, at once, not
   after a timeout, even when the page already showed the message from the attempt before (the engine tells
   the new page from the old one). The page keeps a captcha after a success (the next report needs a new
   one), so `gone` is not asked.
4. **The solver hears the verdict** (`verdict`, below), and the next attempt starts on the new image.

A form captcha needs `verify.selector`. Every report costs one captcha: a crawl of many reports is many
solves, and `maxSolves` caps them.

### The manual solver

`"solver": "manual"` is built in, for headed runs: a person types the code in the browser window and presses
the button. The solver waits (10 minutes, or the step's `timeoutMs`) until the page navigates or the success
element shows, and the engine checks the page as for any solver; the `submit` steps do not run, since the
person submitted. Paired with a reader's audit, it collects what people typed and whether the site took it:
the labelled images a reader is tuned on.

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

- **Do your part, then return `solved`.** A reader fills `challenge.field`; a widget solver puts the token
  where the widget would (`g-recaptcha-response`, `cf-turnstile-response`) and runs its `data-callback` or
  submits its form. When the recipe has `submit` steps, the engine runs them after you; return
  `{ status: 'solved', submitted: true }` when you submitted yourself (or a person did).
- **`verdict(challenge, { status: 'solved' | 'rejected', reason? })`**, optional, tells you what the page said
  after a `solved`: for an audit log, or to report a bad token to a service that refunds them.
- **`close()`**, optional, runs when the crawler closes: let a worker or a connection go.
- **`timeoutMs`**, optional, is your default time per solve when the recipe does not set one.
- **Throw or return `failed`** with a reason: both count as a failed attempt, and the reason reaches the trace.
- **Honour `signal`.** Stop polling your service when it aborts.
- **Use `lease` when the service accepts a proxy**: tokens are often tied to the IP that asked for them.

[`examples/captcha-solver/capsolver.mjs`](../../examples/captcha-solver/capsolver.mjs) is a complete solver for
CapSolver: reCAPTCHA v2 and v3, Turnstile and image captchas, with tests against a faked API.

## Api recipes

An api recipe has no page to solve on. With `session.captcha`, a fetched page that shows a widget fails as a
block that says so. Put the part that meets the captcha in `session.bootstrap` (a browser), keep the cookies,
and let the requests reuse them.
