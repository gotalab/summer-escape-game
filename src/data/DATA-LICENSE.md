# Recommendation place data

`generated-destinations.json` is generated from OpenStreetMap extracts distributed by Geofabrik.

- Data: © OpenStreetMap contributors
- License: Open Database License (ODbL) 1.0
- Source: https://download.geofabrik.de/asia/japan.html
- License and attribution: https://www.openstreetmap.org/copyright
- Generator: `scripts/generate-japan-destinations.mjs`

The generated snapshot remains separate from the hand-curated records in
`destinations.ts`. The generator records its snapshot date and source in the
JSON metadata. OpenStreetMap element pages are source references, not proof of
opening hours, public access, safety, or a verified entrance.

This catalog is intentionally not fetched at request time. Refresh it manually
before a seasonal release or roughly monthly while the project is active; place
data does not need the six-hour refresh cadence used for weather.
