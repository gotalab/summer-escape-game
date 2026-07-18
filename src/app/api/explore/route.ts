import { getOrigin } from "@/data/origins";
import type { Origin } from "@/data/types";
import { exploreDestinations } from "@/lib/explore";
import { clockToMinutes, todayInJapan } from "@/lib/time";
import { NextResponse } from "next/server";
import { z } from "zod";

const clock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
const bodySchema = z.object({
  originId: z.string().min(1).optional(),
  origin: z.object({
    name: z.string().trim().min(1).max(80),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }).optional(),
  date: z.iso.date(),
  depart: clock,
  return: clock,
  maxApparentTemperature: z.number().min(-30).max(50).optional(),
  seed: z.string().min(8).max(128).default("legacy-seed"),
  answers: z.array(z.object({ questionId: z.string().min(1).max(40), choiceId: z.string().min(1).max(30) })).max(3).default([]),
  experience: z.enum(["duel", "tickets"]).default("duel"),
}).refine((body) => body.originId !== undefined || body.origin !== undefined, { message: "originId または origin が必要です" });

export async function POST(request: Request) {
  const generatedAt = new Date().toISOString();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return error("INVALID_JSON", "リクエストのJSONを確認してください。", 400, generatedAt);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return error("INVALID_QUERY", "探索条件を確認してください。", 400, generatedAt, z.treeifyError(parsed.error));
  const input = parsed.data;
  const known = input.originId ? getOrigin(input.originId) : undefined;
  if (input.originId && !known && !input.origin) return error("UNKNOWN_ORIGIN", "この出発地にはまだ対応していません。", 400, generatedAt);
  const origin: Origin = known ?? {
    id: `custom:${input.origin!.lat.toFixed(4)},${input.origin!.lon.toFixed(4)}`,
    name: input.origin!.name,
    prefecture: "",
    station: input.origin!.name,
    latitude: input.origin!.lat,
    longitude: input.origin!.lon,
  };
  const today = todayInJapan();
  const last = new Date(`${today}T00:00:00+09:00`);
  last.setDate(last.getDate() + 15);
  const latest = todayInJapan(last);
  if (input.date < today || input.date > latest) return error("DATE_OUTSIDE_FORECAST_WINDOW", "予報を確認できる日付を選んでください。", 400, generatedAt, { from: today, to: latest });
  if (clockToMinutes(input.return) - clockToMinutes(input.depart) < 240) return error("TIME_WINDOW_TOO_SHORT", "4時間以上の空き時間を指定してください。", 400, generatedAt);
  try {
    const result = await exploreDestinations(origin, {
      date: input.date,
      depart: input.depart,
      return: input.return,
      maxApparentTemperature: input.maxApparentTemperature,
      answers: input.answers,
      seed: input.seed,
      experience: input.experience,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=120, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.toUpperCase() : "EXPLORE_FAILED";
    return error(code, "最新の候補を確認できませんでした。時間をおいて再度お試しください。", 503, generatedAt);
  }
}

function error(code: string, message: string, status: number, generatedAt: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) }, generatedAt }, { status });
}
