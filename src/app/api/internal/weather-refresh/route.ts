import { todayInJapan } from "@/lib/time";
import { refreshWeatherSnapshotRange } from "@/lib/weather-snapshot";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
});

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function refreshSecret(): Promise<string | undefined> {
  if (process.env.WEATHER_REFRESH_SECRET) return process.env.WEATHER_REFRESH_SECRET;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    return (await getCloudflareContext({ async: true })).env.WEATHER_REFRESH_SECRET;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const secret = await refreshSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  const startDate = parsed.data.startDate ?? todayInJapan();
  const endDate = parsed.data.endDate ?? addDays(startDate, 15);
  const rangeDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (!Number.isFinite(rangeDays) || rangeDays < 1 || rangeDays > 16) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  }
  try {
    const snapshots = await refreshWeatherSnapshotRange(startDate, endDate);
    return NextResponse.json({
      ok: true,
      refreshedAt: snapshots[0]?.fetchedAt ?? new Date().toISOString(),
      dates: snapshots.map(({ date, samples }) => ({ date, sampleCount: samples.length })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("weather_refresh_failed", error);
    return NextResponse.json({ ok: false, error: { code: "WEATHER_REFRESH_FAILED" } }, { status: 503 });
  }
}
