# A CapSolver captcha solver

`capsolver.mjs` is a working `CaptchaSolver` for [CapSolver](https://docs.capsolver.com). It sits outside
`@opencraw/core` on purpose: the engine defines the seam, and which paid service you use is your choice.
Copy it, or write one for another service in the same shape.

| Challenge (`kind`) | CapSolver task | Applied as |
|---|---|---|
| `recaptcha-v2` | `ReCaptchaV2TaskProxyLess` (`ReCaptchaV2Task` with `useProxy`) | `g-recaptcha-response`, then the widget's `data-callback` or its form's submit |
| `recaptcha-v3` | `ReCaptchaV3TaskProxyLess`, `pageAction` from `data-action` (default `verify`) | same |
| `turnstile` | `AntiTurnstileTaskProxyLess` | `cf-turnstile-response`, then callback or submit |
| `image` | `ImageToTextTask`, a screenshot of the image | typed into `imageInput`, then Enter |
| `hcaptcha`, `unknown` | – | fails: register another solver |

Task types and prices change; check CapSolver's documentation before relying on one.

## Use it

```js
// plugins.mjs
import { capsolver } from './examples/captcha-solver/capsolver.mjs'
export const captchaSolvers = [capsolver({ apiKey: process.env.CAPSOLVER_KEY })]
```

```sh
CAPSOLVER_KEY=... opencraw run recipes/ --plugins plugins.mjs
```

```json
"session": { "captcha": { "solver": "capsolver", "maxSolves": 5 } }
```

In code: `createCrawler({ captchaSolvers: [capsolver({ apiKey })] })`.

| Option | Default | |
|---|---|---|
| `apiKey` | | Required. |
| `name` | `capsolver` | The name recipes use. |
| `useProxy` | `false` | Solve through the run's proxy (the access lease). CapSolver's workers must reach it, so it works with a provider's proxy, not a local one. |
| `imageInput` | | Where an image captcha's text goes. |
| `pollMs` | `3000` | How often to ask for the result. |

The engine aborts the solve (`signal`) after `session.captcha.timeoutMs`, so a stuck task stops polling.

## Test it

```sh
OPENCRAW_CHROMIUM=/path/to/chrome node --test examples/captcha-solver/capsolver.test.mjs
```

The API is faked; token injection runs in a real Chromium page. Nothing is sent to CapSolver.
