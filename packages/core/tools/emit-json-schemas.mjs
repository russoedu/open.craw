// Writes the JSON Schema for both recipe kinds and access config files into schemas/, from the BUILT
// library (dist/), so the files can never disagree with the published contracts.
// Run through `nx run core:schemas`, which builds first.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { accessConfigJsonSchema, inputRecipeJsonSchema, outputRecipeJsonSchema } = await import(join(here, '..', 'dist', 'index.esm.js'))

const target = join(here, '..', 'schemas')
mkdirSync(target, { recursive: true })
for (const [name, schema] of [['input-recipe', inputRecipeJsonSchema()], ['output-recipe', outputRecipeJsonSchema()], ['access-config', accessConfigJsonSchema()]]) {
  const path = join(target, `${name}.schema.json`)
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`wrote ${path}`)
}
