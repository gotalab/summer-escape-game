import { destinationCategories } from "@/data/types";
import { getOrigin, origins } from "@/data/origins";
import { createRecommendations } from "@/lib/recommendations";
import { todayInJapan } from "@/lib/time";
import { NextResponse } from "next/server";
import { z } from "zod";

const clock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
const querySchema = z.object({
  originId: z.string().min(1),
  date: z.iso.date(),
  depart: clock,
  return: clock,
  preference: z.enum(destinationCategories).optional(),
  walking: z.enum(["low", "medium", "high", "light", "moderate", "adventure"]).transform((value) => {
    if (value === "light") return "low" as const;
    if (value === "moderate") return "medium" as const;
    if (value === "adventure") return "high" as const;
    return value;
  }).default("medium"),
});

export async function GET(request: Request) {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("INVALID_QUERY", "検索条件を確認してください。", 400, z.treeifyError(parsed.error));
  }
  const origin = getOrigin(parsed.data.originId);
  if (!origin) return apiError("UNKNOWN_ORIGIN", "この出発地にはまだ対応していません。", 400, { availableOrigins: origins });
  const today = todayInJapan();
  const lastForecastDate = new Date(`${today}T00:00:00+09:00`);
  lastForecastDate.setDate(lastForecastDate.getDate() + 15);
  const latest = todayInJapan(lastForecastDate);
  if (parsed.data.date < today || parsed.data.date > latest) {
    return apiError("DATE_OUTSIDE_FORECAST_WINDOW", "予報を確認できる日付を選んでください。", 400, { availableRange: { from: today, to: latest } });
  }
  if (clockToMinutes(parsed.data.return) - clockToMinutes(parsed.data.depart) < 240) {
    return apiError("TIME_WINDOW_TOO_SHORT", "4時間以上の空き時間を指定してください。", 400, { minimumMinutes: 240 });
  }
  try {
    const response = await createRecommendations(origin, parsed.data);
    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.toUpperCase() : "RECOMMENDATION_FAILED";
    return apiError(code, "最新の予報を確認できませんでした。時間をおいて再度お試しください。", 200);
  }
}

function apiError(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) }, generatedAt: new Date().toISOString() }, { status });
}

function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
