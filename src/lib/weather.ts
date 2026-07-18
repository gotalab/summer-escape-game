import type { PlacePoint } from "@/data/types";

export const WEATHER_SOURCE = {
  name: "Open-Meteo Forecast API",
  url: "https://open-meteo.com/",
} as const;

export interface WeatherSummary {
  apparentTemperature: number;
  temperature: number;
  precipitationProbability: number;
  windSpeed: number;
  weatherCode: number;
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
    weather_code?: number[];
  };
}

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
const max = (values: number[]) => values.length ? Math.max(...values) : Number.NaN;
// A hackathon visitor should not trigger a national refresh. One snapshot per
// target date and day is enough; the exact acquisition time is shown in the UI.
export const WEATHER_CACHE_TTL_SECONDS = 24 * 60 * 60;
const CACHE_TTL_MS = WEATHER_CACHE_TTL_SECONDS * 1000;
export type WeatherByDate = Map<string, Map<string, WeatherSummary>>;
const weatherCache = new Map<string, { expiresAt: number; value: Promise<WeatherByDate> }>();
// The forecast endpoint accepts comma-separated coordinates. Large, serial
// batches protect the public upstream from a burst caused by the map and the
// exploration flow loading at the same time.
const FORECAST_BATCH_SIZE = 100;
const FORECAST_CONCURRENCY = 1;
let forecastQueue: Promise<void> = Promise.resolve();

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function fetchForecast(url: string): Promise<Response> {
  // The map and the discovery flow can start together. Serialize their first
  // public-API request so a cold page load does not look like a burst client.
  const previous = forecastQueue;
  let release!: () => void;
  forecastQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
        cf: { cacheTtl: WEATHER_CACHE_TTL_SECONDS, cacheEverything: true },
      } as RequestInit);
      if (response.status !== 429 || attempt === 1) return response;
      await pause(750);
    }
    throw new Error("weather_upstream_unavailable");
  } finally {
    release();
  }
}

function pointSetFingerprint(points: PlacePoint[]): string {
  let hash = 2_166_136_261;
  for (const point of points) {
    const value = `${point.id}:${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}|`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `${points.length}:${(hash >>> 0).toString(36)}`;
}

export function summarizeForecast(response: OpenMeteoResponse, date: string, startHour = 11, endHour = 17): WeatherSummary | null {
  const hourly = response.hourly;
  if (!hourly?.time || !hourly.temperature_2m || !hourly.apparent_temperature || !hourly.precipitation_probability || !hourly.wind_speed_10m || !hourly.weather_code) return null;
  const indexes = hourly.time.flatMap((time, index) => {
    const hour = Number(time.slice(11, 13));
    return time.startsWith(date) && hour >= startHour && hour <= endHour ? [index] : [];
  });
  if (!indexes.length) return null;
  const pick = (values: number[]) => indexes.map((index) => values[index]).filter(Number.isFinite);
  // The product is an escape-from-heat finder. The hottest daytime hour is
  // the useful common baseline: an average can hide a punishing 14:00 peak.
  // Shade, water, caves and indoor cooling remain separate place attributes.
  const apparentTemperature = max(pick(hourly.apparent_temperature));
  const temperature = max(pick(hourly.temperature_2m));
  const precipitationProbability = max(pick(hourly.precipitation_probability));
  const windSpeed = mean(pick(hourly.wind_speed_10m));
  const codes = pick(hourly.weather_code);
  if (![apparentTemperature, temperature, precipitationProbability, windSpeed].every(Number.isFinite)) return null;
  return {
    apparentTemperature: Number(apparentTemperature.toFixed(1)),
    temperature: Number(temperature.toFixed(1)),
    precipitationProbability: Math.round(precipitationProbability),
    windSpeed: Number(windSpeed.toFixed(1)),
    weatherCode: codes[Math.floor(codes.length / 2)] ?? 0,
  };
}

function datesBetween(startDate: string, endDate: string): string[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("invalid_weather_date_range");
  return Array.from({ length: Math.floor((end - start) / 86_400_000) + 1 }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

export async function fetchWeather(points: PlacePoint[], date: string): Promise<Map<string, WeatherSummary>> {
  return new Map((await fetchWeatherRange(points, date, date)).get(date) ?? []);
}

/**
 * Fetches several forecast dates in one provider request per coordinate batch.
 * A scheduled refresh can persist each returned date as a shared snapshot, so
 * user exploration never needs to repeat the same national acquisition.
 */
export async function fetchWeatherRange(points: PlacePoint[], startDate: string, endDate: string): Promise<WeatherByDate> {
  const now = Date.now();
  for (const [key, entry] of weatherCache) if (entry.expiresAt <= now) weatherCache.delete(key);
  const key = `${startDate}:${endDate}|${pointSetFingerprint(points)}`;
  const cached = weatherCache.get(key);
  if (cached) return cloneWeatherByDate(await cached.value);
  const value = fetchWeatherRangeUncached(points, startDate, endDate);
  weatherCache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  while (weatherCache.size > 12) weatherCache.delete(weatherCache.keys().next().value!);
  try {
    return cloneWeatherByDate(await value);
  } catch (error) {
    weatherCache.delete(key);
    throw error;
  }
}

function cloneWeatherByDate(source: WeatherByDate): WeatherByDate {
  return new Map([...source].map(([date, summaries]) => [date, new Map(summaries)]));
}

async function fetchWeatherRangeUncached(points: PlacePoint[], startDate: string, endDate: string): Promise<WeatherByDate> {
  const dates = datesBetween(startDate, endDate);
  const chunks: PlacePoint[][] = [];
  for (let index = 0; index < points.length; index += FORECAST_BATCH_SIZE) chunks.push(points.slice(index, index + FORECAST_BATCH_SIZE));
  const maps: Array<WeatherByDate> = new Array(chunks.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(FORECAST_CONCURRENCY, chunks.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const chunk = chunks[index];
      if (!chunk) return;
    const query = new URLSearchParams({
      latitude: chunk.map((point) => point.latitude).join(","),
      longitude: chunk.map((point) => point.longitude).join(","),
      hourly: "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code",
      timezone: "Asia/Tokyo",
      start_date: startDate,
      end_date: endDate,
    });
    const elevations = chunk.map((point) => {
      const value = "elevationM" in point ? point.elevationM : null;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    });
    if (elevations.every((value): value is number => value !== null)) query.set("elevation", elevations.join(","));
    const response = await fetchForecast(`https://api.open-meteo.com/v1/forecast?${query}`);
    if (!response.ok) throw new Error(`weather_upstream_${response.status}`);
    const raw = await response.json() as OpenMeteoResponse | OpenMeteoResponse[];
    const results = Array.isArray(raw) ? raw : [raw];
    maps[index] = new Map(dates.map((date) => [date, new Map(chunk.flatMap((point, pointIndex) => {
      const summary = summarizeForecast(results[pointIndex], date);
      return summary ? [[point.id, summary] as const] : [];
    }))]));
    }
  }));
  return new Map(dates.map((date) => [date, new Map(maps.flatMap((map) => [...(map.get(date) ?? new Map()).entries()]))]));
}
