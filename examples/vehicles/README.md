# Every version and configuration of one model: BYD UK and Kia UK

One output, two manufacturers, two very different routes to the same records: version, trim, price,
powertrain, boot, doors and the colours each version can be had in.

| File | Route |
|---|---|
| `vehicle-configuration.output.json` | `make`, `model`, `version`, `trim`, `configuration`, `price` (GBP), `engine`, `fuel`, `doors`, `bootVolumeLitres`, `colours`, plus generated `source`, `url`, `scrapedAt`. Key: make + model + version + trim + configuration. |
| `byd-seal.input.json` | The configurator page embeds `"carPath": "https://cms-api.byd.com/car/byd/uk/<code>.json"`. That JSON holds every version (Design, Excellence) with its colours and one priced SKU per colour × interior × wheel combination: 24 records. BYD's motor, boot and door fields are empty, so those stay `null`; power and drive come from the sales bullets where BYD states them. |
| `kia-ev3.input.json` | Three server-rendered pages: `/specification/` (motor, boot litres, read with `regex` from the table text), the model page (a `data-vrdata` JSON per trim with its colours) and `/pricing/` (one table row per version: quoted trim, battery, power, gearbox, drivetrain, OTR price): 5 records. Doors are on none of them. |

```sh
npm run core:build
node examples/vehicles/run.mjs                  # both, no browser needed
node examples/vehicles/run.mjs --only kia-uk
node examples/vehicles/run.mjs --trace
```

Records land in `examples/vehicles/out/vehicles.jsonl`. To crawl another model, change the start URL (BYD:
`/uk/configurator/<model>`; Kia: `vars.model`).

Peugeot UK was the original second source. Its Akamai edge answers "Access Denied" to this sandbox's
network, browser included, so Kia replaced it; the recipes' shape would be the same.
