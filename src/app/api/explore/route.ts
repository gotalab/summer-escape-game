import { getOrigin } from "@/data/origins";
import type { Origin } from "@/data/types";
import { exploreDestinations } from "@/lib/explore";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  originId: z.string().min(1).optional(),
  origin: z.object({
    name: z.string().trim().min(1).max(80),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }).optional(),
  seed: z.string().min(8).max(128).default("legacy-seed"),
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
  try {
    const result = exploreDestinations(origin, { seed: input.seed });
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=120, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.toUpperCase() : "EXPLORE_FAILED";
    return error(code, "最新の候補を確認できませんでした。時間をおいて再度お試しください。", 503, generatedAt);
  }
}

function error(code: string, message: string, status: number, generatedAt: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) }, generatedAt }, { status });
}
