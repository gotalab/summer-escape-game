import type { PlacePoint } from "@/data/types";
import { compactDate, secondsToClock } from "./time";

export const TRANSIT_SOURCE = {
  name: "Transit API (非公式)",
  url: "https://api.transit.ls8h.com/",
} as const;

interface TransitLeg {
  kind: "transit" | "walk";
  routeName?: string;
  mode?: string;
  departureSecs: number;
  arrivalSecs: number;
}

interface Journey {
  departureSecs: number;
  arrivalSecs: number;
  durationSecs: number;
  transferCount: number;
  fare?: { currency: string; ticket: number; ic?: number };
  accessWalkSecs?: number | null;
  egressWalkSecs?: number | null;
  legs: TransitLeg[];
}

interface PlanResponse { journeys?: Journey[] }

export interface RouteSummary {
  departure: string;
  arrival: string;
  durationMinutes: number;
  transfers: number;
  walkingMinutes: number;
  fareYen?: number;
  lines: string[];
  usesAir: boolean;
}

export interface RoundTrip {
  status: "available" | "unavailable";
  roundTripPossible: boolean;
  outbound?: RouteSummary;
  inbound?: RouteSummary;
  stayMinutes?: number;
  reason?: "no_outbound" | "no_inbound" | "insufficient_stay" | "provider_error" | "access_unverified";
}

function geo(point: PlacePoint): string {
  return `geo:${point.latitude},${point.longitude}`;
}

function toSummary(journey: Journey): RouteSummary {
  return {
    departure: secondsToClock(journey.departureSecs),
    arrival: secondsToClock(journey.arrivalSecs),
    durationMinutes: Math.ceil(journey.durationSecs / 60),
    transfers: journey.transferCount,
    walkingMinutes: Math.ceil(((journey.accessWalkSecs ?? 0) + (journey.egressWalkSecs ?? 0) + journey.legs.filter((leg) => leg.kind === "walk").reduce((sum, leg) => sum + Math.max(0, leg.arrivalSecs - leg.departureSecs), 0)) / 60),
    fareYen: journey.fare?.currency === "JPY" ? (journey.fare.ic ?? journey.fare.ticket) : undefined,
    lines: [...new Set(journey.legs.flatMap((leg) => leg.kind === "transit" && leg.routeName ? [leg.routeName] : []))],
    usesAir: journey.legs.some((leg) => leg.kind === "transit" && leg.mode === "air"),
  };
}

async function plan(from: PlacePoint, to: PlacePoint, date: string, time: string, type: "departure" | "arrival", allowAir: boolean): Promise<Journey[]> {
  const query = new URLSearchParams({
    from: geo(from),
    to: geo(to),
    fromLabel: from.name,
    toLabel: to.name,
    date: compactDate(date),
    time,
    type,
    // The choice in the exploration game controls this explicitly. A user
    // choosing a ground journey should never receive a surprise flight.
    avoidModes: allowAir ? "ferry" : "air,ferry",
    maxTransfers: "4",
    numItineraries: "3",
  });
  const response = await fetch(`https://api.transit.ls8h.com/api/v1/plan?${query}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`transit_upstream_${response.status}`);
  const data = await response.json() as PlanResponse;
  return (data.journeys ?? []).filter((journey) =>
    journey.durationSecs > 0 && journey.legs.some((leg) => leg.kind === "transit"),
  );
}

export async function fetchRoundTrip(
  origin: PlacePoint,
  destination: PlacePoint,
  date: string,
  depart: string,
  returnBy: string,
  minimumStayMinutes = 120,
  allowAir = false,
): Promise<RoundTrip> {
  try {
    const [outboundJourneys, inboundJourneys] = await Promise.all([
      plan(origin, destination, date, depart, "departure", allowAir),
      plan(destination, origin, date, returnBy, "arrival", allowAir),
    ]);
    const departSecs = clockSeconds(depart);
    const returnSecs = clockSeconds(returnBy);
    const outbound = outboundJourneys.filter((journey) => journey.departureSecs >= departSecs).sort((a, b) => a.arrivalSecs - b.arrivalSecs)[0];
    if (!outbound) return { status: "unavailable", roundTripPossible: false, reason: "no_outbound" };
    const inbound = inboundJourneys
      .filter((journey) => journey.departureSecs >= outbound.arrivalSecs && journey.arrivalSecs <= returnSecs)
      .sort((a, b) => b.departureSecs - a.departureSecs)[0];
    if (!inbound) return { status: "unavailable", roundTripPossible: false, outbound: toSummary(outbound), reason: "no_inbound" };
    const stayMinutes = Math.floor((inbound.departureSecs - outbound.arrivalSecs) / 60);
    const possible = stayMinutes >= minimumStayMinutes;
    return {
      status: possible ? "available" : "unavailable",
      roundTripPossible: possible,
      outbound: toSummary(outbound),
      inbound: toSummary(inbound),
      stayMinutes,
      reason: possible ? undefined : "insufficient_stay",
    };
  } catch {
    return { status: "unavailable", roundTripPossible: false, reason: "provider_error" };
  }
}

function clockSeconds(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60 + minutes) * 60;
}
