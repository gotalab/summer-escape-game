import { forecastCellSamples, terrainElevationAt } from "@/data/weather-cells";
import { destinationCatalog } from "@/data/destination-catalog";
import type { PlacePoint } from "@/data/types";
import { isPublishedDestination } from "@/data/reviewed-destinations";
import { fetchWeatherRange, WEATHER_CACHE_TTL_SECONDS, type WeatherSummary } from "./weather";

const SNAPSHOT_VERSION = 1;
const STALE_GRACE_SECONDS = WEATHER_CACHE_TTL_SECONDS;
const TERRAIN_ESTIMATE_RETRY_SECONDS = 3 * 60 * 60;
const STANDARD_LAPSE_RATE_C_PER_METER = 0.0065;

export interface WeatherSnapshot {
  version: number;
  date: string;
  fetchedAt: string;
  expiresAt: string;
  /** A snapshot can be safely shown while a refresh is temporarily unavailable. */
  stale: boolean;
  mode: "forecast" | "terrain-estimate";
  samples: Array<[string, WeatherSummary]>;
}

export interface WeatherSnapshotMeta {
  date: string;
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
  mode: "forecast" | "terrain-estimate";
  sampleCount: number;
}

export type WeatherValueMode = "direct-forecast" | "interpolated-forecast" | "terrain-estimate";

type StoredSnapshot = Omit<WeatherSnapshot, "stale">;

const memorySnapshots = new Map<string, StoredSnapshot>();
const snapshotLoads = new Map<string, Promise<WeatherSnapshot>>();
const snapshotCachePrefix = "https://summer-escape.invalid/weather-snapshots/v1/";

function snapshotKey(date: string): Request {
  return new Request(`${snapshotCachePrefix}${date}`);
}

function cacheStore(): Cache | null {
  const storage = (globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }).caches;
  return storage?.default ?? null;
}

function isStoredSnapshot(value: unknown): value is StoredSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredSnapshot>;
  return candidate.version === SNAPSHOT_VERSION
    && typeof candidate.date === "string"
    && typeof candidate.fetchedAt === "string"
    && typeof candidate.expiresAt === "string"
    && (candidate.mode === "forecast" || candidate.mode === "terrain-estimate")
    && Array.isArray(candidate.samples);
}

function isFresh(snapshot: StoredSnapshot, now: number): boolean {
  return Date.parse(snapshot.expiresAt) > now;
}

function isUsableStale(snapshot: StoredSnapshot, now: number): boolean {
  return Date.parse(snapshot.expiresAt) + STALE_GRACE_SECONDS * 1000 > now;
}

function withStatus(snapshot: StoredSnapshot, stale: boolean): WeatherSnapshot {
  return { ...snapshot, stale, samples: snapshot.samples.map(([id, summary]): [string, WeatherSummary] => [id, { ...summary }]) };
}

async function snapshotKv(): Promise<KVNamespace | null> {
  // The binding is intentionally optional: local `next dev` and a preview
  // without KV still run, while production can add WEATHER_SNAPSHOTS without
  // a second code path. Cache API remains the hot layer in both cases.
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    return (await getCloudflareContext({ async: true })).env.WEATHER_SNAPSHOTS ?? null;
  } catch {
    return null;
  }
}

async function readPersistentSnapshot(date: string): Promise<StoredSnapshot | null> {
  const edgeCache = cacheStore();
  const cacheHit = edgeCache ? await edgeCache.match(snapshotKey(date)) : undefined;
  if (cacheHit) {
    const candidate = await cacheHit.json().catch(() => null);
    if (isStoredSnapshot(candidate)) return candidate;
  }

  const kv = await snapshotKv();
  const candidate = kv ? await kv.get<unknown>(`forecast:${date}`, "json") : null;
  if (!isStoredSnapshot(candidate)) return null;
  if (edgeCache) {
    await edgeCache.put(snapshotKey(date), new Response(JSON.stringify(candidate), {
      headers: { "Cache-Control": `public, max-age=${WEATHER_CACHE_TTL_SECONDS}` },
    }));
  }
  return candidate;
}

async function persistSnapshot(snapshot: StoredSnapshot): Promise<void> {
  const edgeCache = cacheStore();
  const kv = await snapshotKv();
  await Promise.all([
    edgeCache?.put(snapshotKey(snapshot.date), new Response(JSON.stringify(snapshot), {
      headers: { "Cache-Control": `public, max-age=${WEATHER_CACHE_TTL_SECONDS}` },
    })) ?? Promise.resolve(),
    // Keep one stale snapshot for another day so an upstream 429 does
    // not erase the map for everyone just as the refresh window rolls over.
    kv?.put(`forecast:${snapshot.date}`, JSON.stringify(snapshot), {
      expirationTtl: WEATHER_CACHE_TTL_SECONDS + STALE_GRACE_SECONDS,
    }) ?? Promise.resolve(),
  ]);
}

export function buildWeatherSnapshot(
  date: string,
  weather: Map<string, WeatherSummary>,
  fetchedAt = new Date().toISOString(),
): StoredSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    date,
    fetchedAt,
    expiresAt: new Date(Date.parse(fetchedAt) + WEATHER_CACHE_TTL_SECONDS * 1000).toISOString(),
    mode: "forecast",
    // Scheduled runs may include exact destination coordinates in addition to
    // the nationwide mosaic samples. Preserve both under their stable ids.
    samples: [...weather].map(([id, summary]): [string, WeatherSummary] => [id, { ...summary }]),
  };
}

function terrainEstimate(sample: PlacePoint, date: string): WeatherSummary {
  const elevation = elevationOf(sample) ?? 0;
  const month = Number(date.slice(5, 7));
  // This is deliberately conservative and deterministic. It is not presented
  // as a forecast: latitude and elevation only keep the discovery flow usable
  // until a real shared snapshot can be acquired.
  const summerBase = month === 8 ? 32.5 : month === 7 ? 32 : month === 9 ? 29 : 27;
  const seaLevelTemperature = Math.max(24, Math.min(34, summerBase - (sample.latitude - 35) * 0.55));
  const temperature = seaLevelTemperature - elevation * STANDARD_LAPSE_RATE_C_PER_METER;
  return {
    temperature: Number(temperature.toFixed(1)),
    apparentTemperature: Number((temperature + Math.max(0, temperature - 27) * 0.18).toFixed(1)),
    precipitationProbability: 30,
    windSpeed: 6,
    weatherCode: 3,
  };
}

export function buildTerrainEstimateSnapshot(date: string, fetchedAt = new Date().toISOString()): StoredSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    date,
    fetchedAt,
    // A real forecast remains shared for a day. A first-fetch failure should
    // stay usable, but not mask an upstream recovery for the whole day.
    expiresAt: new Date(Date.parse(fetchedAt) + TERRAIN_ESTIMATE_RETRY_SECONDS * 1000).toISOString(),
    mode: "terrain-estimate",
    samples: forecastCellSamples.map((sample): [string, WeatherSummary] => [sample.id, terrainEstimate(sample, date)]),
  };
}

/**
 * Scheduler boundary for one shared national acquisition covering several
 * dates. Each date is persisted under its ordinary snapshot key, so requests
 * for today, tomorrow and the weekend reuse the same run independently.
 */
export async function refreshWeatherSnapshotRange(startDate: string, endDate: string): Promise<WeatherSnapshot[]> {
  const targets = [...forecastCellSamples, ...destinationCatalog.filter(isPublishedDestination)];
  const uniqueTargets = [...new Map(targets.map((target) => [target.id, target])).values()];
  const weatherByDate = await fetchWeatherRange(uniqueTargets, startDate, endDate);
  const fetchedAt = new Date().toISOString();
  const snapshots = [...weatherByDate].map(([date, weather]) => buildWeatherSnapshot(date, weather, fetchedAt));
  if (!snapshots.length || snapshots.some((snapshot) => !snapshot.samples.length)) throw new Error("weather_snapshot_range_empty");
  await Promise.all(snapshots.map(async (snapshot) => {
    memorySnapshots.set(snapshot.date, snapshot);
    await persistSnapshot(snapshot);
  }));
  return snapshots.map((snapshot) => withStatus(snapshot, false));
}

/**
 * Loads a shared national forecast without contacting the provider. Only the
 * authenticated scheduler boundary above may acquire new weather data; a
 * visitor request reads a stored snapshot or receives an honest terrain-only
 * fallback.
 */
export async function getWeatherSnapshot(date: string, now = Date.now()): Promise<WeatherSnapshot> {
  const activeLoad = snapshotLoads.get(date);
  if (activeLoad) return activeLoad;
  const fromMemory = memorySnapshots.get(date);
  if (fromMemory && isFresh(fromMemory, now)) return withStatus(fromMemory, false);
  const load = (async () => {
    const stored = fromMemory ?? await readPersistentSnapshot(date);
    if (stored) memorySnapshots.set(date, stored);
    if (stored && isFresh(stored, now)) return withStatus(stored, false);
    if (stored?.mode === "forecast" && isUsableStale(stored, now)) return withStatus(stored, true);
    const fallback = buildTerrainEstimateSnapshot(date);
    memorySnapshots.set(date, fallback);
    await persistSnapshot(fallback);
    return withStatus(fallback, false);
  })().finally(() => snapshotLoads.delete(date));
  snapshotLoads.set(date, load);
  return load;
}

export function weatherSnapshotMeta(snapshot: WeatherSnapshot): WeatherSnapshotMeta {
  return {
    date: snapshot.date,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
    stale: snapshot.stale,
    mode: snapshot.mode,
    sampleCount: snapshot.samples.length,
  };
}

export function weatherValueMode(snapshot: WeatherSnapshot, pointId: string): WeatherValueMode {
  if (snapshot.mode === "terrain-estimate") return "terrain-estimate";
  return snapshot.samples.some(([id]) => id === pointId) ? "direct-forecast" : "interpolated-forecast";
}

/** Test-only reset for module-scoped request coalescing and hot snapshots. */
export function __resetWeatherSnapshotStateForTests(): void {
  memorySnapshots.clear();
  snapshotLoads.clear();
}

function elevationOf(point: PlacePoint): number | null {
  const value = "elevationM" in point ? point.elevationM : null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : terrainElevationAt(point.latitude, point.longitude);
}

function distanceSquared(left: PlacePoint, right: PlacePoint): number {
  return (left.latitude - right.latitude) ** 2
    + ((left.longitude - right.longitude) * Math.cos(left.latitude * Math.PI / 180)) ** 2;
}

/**
 * Estimates a point from the four nearest nationwide forecast samples. The
 * product labels the map as a 180-point forecast; this helper makes the quiz
 * consume that very same snapshot rather than quietly issuing per-user calls.
 */
export function weatherFromSnapshot(snapshot: WeatherSnapshot, points: PlacePoint[]): Map<string, WeatherSummary> {
  const summaries = new Map(snapshot.samples);
  const known = forecastCellSamples.flatMap((sample) => {
    const summary = summaries.get(sample.id);
    return summary ? [{ sample, summary }] : [];
  });
  const result = new Map<string, WeatherSummary>();
  for (const point of points) {
    const direct = summaries.get(point.id);
    if (direct) {
      result.set(point.id, { ...direct });
      continue;
    }
    const nearest = known
      .map(({ sample, summary }) => ({ sample, summary, distance: distanceSquared(point, sample) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 4);
    if (!nearest.length) continue;
    const targetElevation = elevationOf(point);
    let weight = 0;
    let temperature = 0;
    let apparentTemperature = 0;
    let precipitationProbability = 0;
    let windSpeed = 0;
    for (const entry of nearest) {
      const currentWeight = 1 / Math.max(0.01, entry.distance);
      const elevationDelta = targetElevation === null ? 0 : targetElevation - entry.sample.elevationM;
      temperature += (entry.summary.temperature - elevationDelta * STANDARD_LAPSE_RATE_C_PER_METER) * currentWeight;
      // Apparent temperature is already derived from temperature, humidity,
      // wind and radiation by the provider. A fixed air-temperature lapse
      // rate is not a valid correction for that combined index.
      apparentTemperature += entry.summary.apparentTemperature * currentWeight;
      precipitationProbability += entry.summary.precipitationProbability * currentWeight;
      windSpeed += entry.summary.windSpeed * currentWeight;
      weight += currentWeight;
    }
    result.set(point.id, {
      temperature: Number((temperature / weight).toFixed(1)),
      apparentTemperature: Number((apparentTemperature / weight).toFixed(1)),
      precipitationProbability: Math.round(precipitationProbability / weight),
      windSpeed: Number((windSpeed / weight).toFixed(1)),
      weatherCode: nearest[0].summary.weatherCode,
    });
  }
  return result;
}
