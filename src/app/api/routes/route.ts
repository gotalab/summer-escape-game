import { destinationById } from "@/data/destination-catalog";
import { getOrigin } from "@/data/origins";
import type { Origin } from "@/data/types";
import { fetchRoundTrip, TRANSIT_SOURCE, type RoundTrip, type RouteSummary } from "@/lib/transit";
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
  destinationIds: z.array(z.string().min(1)).min(1).max(3),
  allowAir: z.boolean().default(false),
  date: z.iso.date(),
  depart: clock,
  return: clock,
}).refine((body) => body.originId !== undefined || body.origin !== undefined, { message: "originId または origin が必要です" });

export async function POST(request: Request) {
  const generatedAt = new Date().toISOString();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("INVALID_QUERY", "経路の条件を確認してください。", 400, generatedAt);
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
  const selected = input.destinationIds.flatMap((id) => {
    const destination = destinationById.get(id);
    return destination ? [destination] : [];
  });
  if (selected.length !== input.destinationIds.length) return error("UNKNOWN_DESTINATION", "候補地を確認できませんでした。", 400, generatedAt);

  const results = await Promise.all(selected.map(async (destination) => {
    if (!destination.routePoint) return { id: destination.id, route: { status: "unavailable" as const, reason: "access_unverified" as const } };
    const routeTarget = { ...destination, latitude: destination.routePoint.latitude, longitude: destination.routePoint.longitude };
    return { id: destination.id, route: routePayload(await fetchRoundTrip(origin, routeTarget, input.date, input.depart, input.return, 120, input.allowAir)) };
  }));
  const partial = results.some((result) => result.route.reason === "provider_error");
  return NextResponse.json({
    ok: true,
    generatedAt,
    routes: results,
    source: { name: TRANSIT_SOURCE.name, status: partial ? "partial" : "ok", fetchedAt: generatedAt, url: TRANSIT_SOURCE.url },
  }, { headers: { "Cache-Control": "public, max-age=120, s-maxage=900, stale-while-revalidate=1800" } });
}

function routePayload(route: RoundTrip) {
  return {
    status: route.status,
    outbound: route.outbound ? routeLeg(route.outbound) : undefined,
    return: route.inbound ? routeLeg(route.inbound) : undefined,
    roundTripMinutes: route.outbound && route.inbound ? route.outbound.durationMinutes + route.inbound.durationMinutes : undefined,
    stayMinutes: route.stayMinutes,
    reason: route.reason,
  };
}

function routeLeg(leg: RouteSummary) {
  return { durationMinutes: leg.durationMinutes, departure: leg.departure, arrival: leg.arrival, transfers: leg.transfers, walkMinutes: leg.walkingMinutes, fareYen: leg.fareYen, lines: leg.lines, usesAir: leg.usesAir };
}

function error(code: string, message: string, status: number, generatedAt: string) {
  return NextResponse.json({ ok: false, error: { code, message }, generatedAt }, { status });
}
