import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherRange, summarizeForecast } from "./weather";

afterEach(() => vi.unstubAllGlobals());

describe("forecast summary", () => {
  it("uses the hottest 11:00-17:00 apparent temperature, not the daily mean", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => `2026-07-18T${String(hour).padStart(2, "0")}:00`);
    const apparent = Array.from({ length: 24 }, () => 20);
    const temperature = Array.from({ length: 24 }, () => 19);
    apparent[14] = 34;
    temperature[14] = 32;
    const summary = summarizeForecast({ hourly: {
      time: hours,
      temperature_2m: temperature,
      apparent_temperature: apparent,
      precipitation_probability: Array.from({ length: 24 }, () => 10),
      wind_speed_10m: Array.from({ length: 24 }, () => 6),
      weather_code: Array.from({ length: 24 }, () => 1),
    } }, "2026-07-18");

    expect(summary?.apparentTemperature).toBe(34);
    expect(summary?.temperature).toBe(32);
  });

  it("splits one multi-day provider response into date snapshots", async () => {
    const hours = ["2026-07-18T14:00", "2026-07-19T14:00"];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hourly: {
      time: hours,
      temperature_2m: [30, 28],
      apparent_temperature: [33, 29],
      precipitation_probability: [10, 20],
      wind_speed_10m: [5, 7],
      weather_code: [1, 2],
    } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWeatherRange([{ id: "point", name: "地点", prefecture: "東京都", station: "", latitude: 35, longitude: 139 }], "2026-07-18", "2026-07-19");

    expect(result.get("2026-07-18")?.get("point")?.apparentTemperature).toBe(33);
    expect(result.get("2026-07-19")?.get("point")?.apparentTemperature).toBe(29);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
