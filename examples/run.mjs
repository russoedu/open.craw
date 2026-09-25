// Runs the example recipes against the e2e fixture shop. From the repo root:
//   npm run core:build && node examples/run.mjs
// The web recipe needs a browser: `npm run playwright:install` once.
import { createCrawler, jsonLinesSink, loadRecipeSet } from '@opencraw/core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const recipes = await loadRecipeSet({
  output: join(here, 'recipes', 'product.output.json'),
  inputs: [join(here, 'recipes', 'shop-api.input.json'), join(here, 'recipes', 'shop-web.input.json')],
})

const crawler = createCrawler({
  hooks:   { positive: input => Number(input) > 0 },
  sink:    jsonLinesSink(join(here, 'out', 'products.jsonl')),
  onEvent: event => { if (event.type.startsWith('record:') || event.type.startsWith('recipe:')) console.log(event.type, event.recipeId, 'url' in event ? event.url : '') },
})
try {
  const report = await crawler.run(recipes)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await crawler.close()
}
