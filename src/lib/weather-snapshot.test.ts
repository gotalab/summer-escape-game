import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWeatherRangeMock = vi.hoisted(() => vi.fn());
vi.mock("./weather", async (importOriginal) => {
  const original = await importOriginal<typeof import("./weather")>();
  return { ...original, fetchWeatherRange: fetchWeatherRangeMock };
});

import { forecastCellSamples } from "@/data/weather-cells";
import type { PlacePoint } from "@/data/types";
import {
  __resetWeatherSnapshotStateForTests,
  buildWeatherSnapshot,
  getWeatherSnapshot,
  refreshWeatherSnapshotRange,
  weatherFromSnapshot,
  weatherValueMode,
} from "./weather-snapshot";
import type { WeatherSummary } from "./weather";

const cacheRecords = new Map<string, string>();
const fakeCache = {
  match: vi.fn(async (request: Request) => {
    const value = cacheRecords.get(request.url);
    return value === undefined ? undefined : new Response(value);
  }),
  put: vi.fn(async (request: Request, response: Response) => {
    cacheRecords.set(request.url, await response.text());
  }),
};

function sampleWeather(offset = 0): Map<string, WeatherSummary> {
  return new Map(forecastCellSamples.map((sample, index) => [sample.id, {
    temperature: 30 - index / 100 + offset,
    apparentTemperature: 31 - index / 100 + offset,
    precipitationProbability: index % 50,
    windSpeed: 5 + index / 100,
    weatherCode: 1,
  }]));
}

function storeSnapshot(date: string, fetchedAt: string): void {
  const snapshot = buildWeatherSnapshot(date, sampleWeather(), fetchedAt);
  cacheRecords.set(`https://summer-escape.invalid/weather-snapshots/v1/${date}`, JSON.stringify(snapshot));
}

beforeEach(() => {
  __resetWeatherSnapshotStateForTests();
  fetchWeatherRangeMock.mockReset();
  cacheRecords.clear();
  fakeCache.match.mockClear();
  fakeCache.put.mockClear();
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: fakeCache } });
});

describe("shared weather snapshot", () => {
  it("contains only the bounded nationwide sample, then estimates candidate weather locally", () => {
    const snapshot = { ...buildWeatherSnapshot("2026-07-18", sampleWeather(), "2026-07-17T00:00:00.000Z"), stale: false };
    const point: PlacePoint = { id: "candidate", name: "候補", prefecture: "東京都", station: "", latitude: 35.68, longitude: 139.76 };

    const forecast = weatherFromSnapshot(snapshot, [point]);

    expect(snapshot.samples).toHaveLength(forecastCellSamples.length);
    expect(forecast.get(point.id)).toEqual(expect.objectContaining({
      temperature: expect.any(Number),
      apparentTemperature: expect.any(Number),
      precipitationProbability: expect.any(Number),
    }));
  });

  it("does not apply an air-temperature lapse rate to apparent temperature", () => {
    const weather = sampleWeather();
    for (const summary of weather.values()) summary.apparentTemperature = 31;
    const snapshot = { ...buildWeatherSnapshot("2026-07-18", weather, "2026-07-17T00:00:00.000Z"), stale: false };
    const point: PlacePoint & { elevationM: number } = { id: "summit", name: "山頂", prefecture: "山梨県", station: "", latitude: 35.68, longitude: 139.76, elevationM: 3000 };

    const forecast = weatherFromSnapshot(snapshot, [point]);

    expect(forecast.get(point.id)?.apparentTemperature).toBe(31);
  });

  it("prefers an exact destination forecast over the nationwide interpolation", () => {
    const direct: WeatherSummary = {
      temperature: 18,
      apparentTemperature: 17,
      precipitationProbability: 12,
      windSpeed: 4,
      weatherCode: 1,
    };
    const candidate: PlacePoint = {
      id: "published-candidate",
      name: "公開候補",
      prefecture: "長野県",
      station: "",
      latitude: 36.1,
      longitude: 138.2,
    };
    const weather = sampleWeather();
    weather.set(candidate.id, direct);
    const snapshot = { ...buildWeatherSnapshot("2026-07-18", weather, "2026-07-17T00:00:00.000Z"), stale: false };

    expect(weatherFromSnapshot(snapshot, [candidate]).get(candidate.id)).toEqual(direct);
    expect(weatherValueMode(snapshot, candidate.id)).toBe("direct-forecast");
  });

  it("uses an honestly labelled terrain estimate without contacting the provider on a cache miss", async () => {
    const snapshot = await getWeatherSnapshot("2026-07-18", Date.parse("2026-07-18T00:00:00.000Z"));

    expect(snapshot.mode).toBe("terrain-estimate");
    expect(snapshot.stale).toBe(false);
    expect(snapshot.samples).toHaveLength(forecastCellSamples.length);
    expect(Date.parse(snapshot.expiresAt) - Date.parse(snapshot.fetchedAt)).toBe(3 * 60 * 60 * 1000);
    expect(fetchWeatherRangeMock).not.toHaveBeenCalled();
    expect(fakeCache.put).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh shared snapshot without another upstream request", async () => {
    const now = Date.parse("2026-07-18T06:00:00.000Z");
    storeSnapshot("2026-07-18", "2026-07-18T00:00:00.000Z");

    const snapshot = await getWeatherSnapshot("2026-07-18", now);

    expect(snapshot.mode).toBe("forecast");
    expect(snapshot.stale).toBe(false);
    expect(fetchWeatherRangeMock).not.toHaveBeenCalled();
  });

  it("shows the last forecast as stale without refreshing from a visitor request", async () => {
    const now = Date.parse("2026-07-19T01:00:00.000Z");
    storeSnapshot("2026-07-18", "2026-07-18T00:00:00.000Z");

    const snapshot = await getWeatherSnapshot("2026-07-18", now);

    expect(snapshot.mode).toBe("forecast");
    expect(snapshot.stale).toBe(true);
    expect(fetchWeatherRangeMock).not.toHaveBeenCalled();
  });

  it("does not present a forecast older than the stale grace period", async () => {
    const now = Date.parse("2026-07-20T01:00:00.000Z");
    storeSnapshot("2026-07-18", "2026-07-18T00:00:00.000Z");

    const snapshot = await getWeatherSnapshot("2026-07-18", now);

    expect(snapshot.mode).toBe("terrain-estimate");
    expect(snapshot.stale).toBe(false);
  });

  it("keeps 100 simultaneous visitor requests away from the weather provider", async () => {
    const snapshots = await Promise.all(Array.from({ length: 100 }, () => getWeatherSnapshot("2026-07-18")));

    expect(fetchWeatherRangeMock).not.toHaveBeenCalled();
    expect(new Set(snapshots.map((snapshot) => snapshot.fetchedAt)).size).toBe(1);
    expect(snapshots.every((snapshot) => snapshot.mode === "terrain-estimate")).toBe(true);
  });

  it("stores several target dates from one shared forecast run", async () => {
    fetchWeatherRangeMock.mockResolvedValue(new Map([
      ["2026-07-18", sampleWeather()],
      ["2026-07-19", sampleWeather(1)],
      ["2026-07-20", sampleWeather(2)],
    ]));

    const snapshots = await refreshWeatherSnapshotRange("2026-07-18", "2026-07-20");

    expect(fetchWeatherRangeMock).toHaveBeenCalledTimes(1);
    expect(fetchWeatherRangeMock).toHaveBeenCalledWith(expect.arrayContaining(forecastCellSamples), "2026-07-18", "2026-07-20");
    expect(snapshots.map((snapshot) => snapshot.date)).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
    expect(new Set(snapshots.map((snapshot) => snapshot.fetchedAt)).size).toBe(1);
    expect(fakeCache.put).toHaveBeenCalledTimes(3);
  });
});
