import { forecastCellSamples, JAPAN_WEATHER_CELL_METADATA, weatherCellSamples, type WeatherCellSample } from "@/data/weather-cells";
import { todayInJapan } from "@/lib/time";
import { WEATHER_CACHE_TTL_SECONDS, WEATHER_SOURCE } from "@/lib/weather";
import { getWeatherSnapshot, weatherSnapshotMeta } from "@/lib/weather-snapshot";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ date: z.iso.date() });
function interpolateTemperature(target: WeatherCellSample, known: Array<{ sample: WeatherCellSample; temperatureC: number }>): number | null {
  const nearest = known.reduce<Array<{ temperatureC: number; distance: number }>>((selected, entry) => {
    const distance = (entry.sample.latitude - target.latitude) ** 2
      + ((entry.sample.longitude - target.longitude) * Math.cos(target.latitude * Math.PI / 180)) ** 2;
    const position = selected.findIndex((current) => distance < current.distance);
    if (position < 0) selected.push({ temperatureC: entry.temperatureC, distance });
    else selected.splice(position, 0, { temperatureC: entry.temperatureC, distance });
    if (selected.length > 4) selected.pop();
    return selected;
  }, []);
  let weighted = 0;
  let weight = 0;
  for (const entry of nearest) {
    const currentWeight = 1 / Math.max(0.01, entry.distance);
    weighted += entry.temperatureC * currentWeight;
    weight += currentWeight;
  }
  return weight ? Number((weighted / weight).toFixed(1)) : null;
}

export async function GET(request: Request) {
  const generatedAt = new Date().toISOString();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false, error: { code: "INVALID_DATE" }, generatedAt }, { status: 400 });
  const today = todayInJapan();
  const last = new Date(`${today}T00:00:00+09:00`);
  last.setDate(last.getDate() + 15);
  if (parsed.data.date < today || parsed.data.date > todayInJapan(last)) {
    return NextResponse.json({ ok: false, error: { code: "DATE_OUTSIDE_FORECAST_WINDOW" }, generatedAt }, { status: 400 });
  }
  try {
    const snapshot = await getWeatherSnapshot(parsed.data.date);
    const weather = new Map(snapshot.samples);
    const known = forecastCellSamples.flatMap((sample) => {
      const summary = weather.get(sample.id);
      return summary ? [{ sample, temperatureC: summary.apparentTemperature }] : [];
    });
    if (!known.length) throw new Error("weather_grid_empty");
    return NextResponse.json({
      ok: true,
      generatedAt,
      snapshot: weatherSnapshotMeta(snapshot),
      grid: {
        ...JAPAN_WEATHER_CELL_METADATA,
        forecastSampleCount: snapshot.mode === "forecast" ? known.length : 0,
        estimateSampleCount: snapshot.mode === "terrain-estimate" ? known.length : 0,
      },
      pointFormat: ["lat", "lon", "temperatureC"],
      points: snapshot.mode === "terrain-estimate"
        ? weatherCellSamples.map((sample): [number, number, null] => [Number(sample.latitude.toFixed(4)), Number(sample.longitude.toFixed(4)), null])
        : weatherCellSamples.flatMap((sample): [number, number, number][] => {
        const summary = weather.get(sample.id);
        const temperatureC = summary?.apparentTemperature ?? interpolateTemperature(sample, known);
        return temperatureC !== null ? [[
          Number(sample.latitude.toFixed(4)),
          Number(sample.longitude.toFixed(4)),
          temperatureC,
        ]] : [];
      }),
      source: { ...WEATHER_SOURCE, status: snapshot.mode === "forecast" && !snapshot.stale ? "ok" : "partial", fetchedAt: snapshot.fetchedAt },
    }, { headers: { "Cache-Control": `public, max-age=300, s-maxage=${WEATHER_CACHE_TTL_SECONDS}, stale-while-revalidate=3600` } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "WEATHER_UNAVAILABLE" }, generatedAt }, { status: 200 });
  }
}
