# Execution notes

## Active

- Follow-up catalog mining completed across regional, mechanism and catalog-external lanes; only primary-source-confirmed, non-duplicate places were integrated.
- The latest parent review promoted 17 more concrete destinations with verified official pages and public entry points: seven waterfalls/gorges, five caves, two tourist mines, and three managed springs. Actionable recommendations are now 271 (158 generated and 113 independently curated); 130 reviewed records remain blocked or merged.
- A 32-seed regression pass confirms that all 17 newly promoted destinations rotate into the real 180-place exploration pool; the union covers at least 265 actionable places from the Tokyo origin.
- A real forecast-mode browser pass is externally blocked because Open-Meteo still returns HTTP 429 even for one coordinate. On the latest audit, the standard forecast endpoint, JMA endpoint, and a separate one-variable/one-day request all returned the same daily-limit response.
- Production scheduling and optional KV provisioning remain intentionally unconfigured until deployment authority and secrets exist.
- All ten research tasks completed. Their counts overlap and are not additive; every region remains parent-reviewed before publication.

## Evidence so far

- Open-Meteo is currently returning an upstream daily-limit error locally, so the app is exercising `terrain-estimate`.
- The existing catalog has 2,329 observed places and 271 published/actionable recommendations.
- The national map has 1,819 land cells interpolated from 180 shared samples; the 180-sample weather grid is unrelated to the recommendation candidate-pool count.
- Terrain fallback now labels the map, cards and detail sheet as `地形目安`; it no longer claims to include humidity, wind or radiation.
- Apparent-temperature interpolation no longer applies the fixed air-temperature lapse rate.
- `refreshWeatherSnapshotRange` acquires multiple dates and exact published-destination coordinates in one shared run, then persists ordinary per-date snapshots.
- Visitor-facing snapshot reads never contact the weather provider. Only the bearer-authenticated `/api/internal/weather-refresh` boundary can acquire forecasts, with at most 16 dates per run.
- Live provider evidence on 2026-07-18: a one-coordinate request returned HTTP 429 `Daily API request limit exceeded`; the internal refresh endpoint rejects an unset/invalid secret with HTTP 401.
- No prior real forecast snapshot was found in the local app, Next cache, or temporary artifacts, so fixture data was not substituted as proof of forecast-mode completion.
- Validation after the forecast/terrain question split: review normalization, lint, typecheck, 55 unit tests, production build, and all 14 desktop/mobile E2E tests.
- Live browser evidence: `/tmp/summer-escape-terrain-honesty.png` and `/tmp/summer-escape-terrain-detail.png`.
- Terrain-only final results are now labelled `参考候補`, `順不同・予報待ち`, with no ordinal 01/02/03. Live evidence: `/tmp/summer-escape-terrain-unordered.png`.
- Parent review promoted 15 strong Kyushu candidates, 11 Tokai/Kinki candidates, 17 Hokkaido/Tohoku candidates, 7 Chugoku/Shikoku candidates, 8 cave/spring-mechanism candidates, and 3 catalog-external editorial candidates while withholding conditional or duplicate places. Actionable places increased from 193 to 254; generated actionable places from 93 to 151. Unverified catalog elevations were not copied into the reviewed records.
- Remaining generated-catalog A lanes reported by the research tasks: Hokkaido/Tohoku 12, Kanto 15, Koshinetsu/Hokuriku 22, Chugoku/Shikoku 22, plus the Tokai/Kinki batch. These are intake counts, not published counts; cross-task duplicates and coordinate corrections still need parent review.
- Terrain-only quiz rounds no longer ask temperature, precipitation, or wind questions derived from the fallback model. A direct destination-coordinate forecast is covered by a regression test and wins over nationwide interpolation whenever present.
- A name/mechanism scan found 1,978 exact-ID unreviewed generated places and 235 non-duplicate research leads with an explicit cooling mechanism: 99 gorge/waterfall, 36 cave/wind-hole, 36 highland/forest, 39 waterside/shade, and 25 spring/cold-water places. These remain research leads, not automatically published recommendations.
- The review schema now separates `coolingScope` (`local-microclimate`, `enclosed-space`, `water-contact`, and others) from the broad discovery category. This prevents spring-water temperatures from becoming air temperatures and cave temperatures from becoming outdoor forecasts.
- Live API rotation check after the editorial additions: every run starts with 180 published candidates; 24 deterministic seeds covered all 254 actionable places, including the newly reviewed caves, waterfalls, springs, 菊池渓谷, 大谷資料館 and 生野銀山. The opening quiz still uses a 32-card game deck drawn from that run.
