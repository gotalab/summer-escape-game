# Execution notes

## Current scope

- Three-hour demo: current location or station, six tickets, heat event, real destination reveal, Google Maps and official links.
- Runtime weather, route-provider integration, scheduled refresh, and the E2E harness were removed as non-essential.
- The 1,819 hexagons are a game field, not temperature data.

## Data retained

- All collected destination catalogs, reviewed batches, official URLs, access notes, cooling evidence, map geometry, licenses, and generation/normalization scripts remain.
- Review gates remain in `pnpm check`: 245 normalized generated-place reviews and 113 curated-place reviews.
- Unreviewed places are not promoted merely because they exist in the collected catalog.

## Verification

- Use `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
