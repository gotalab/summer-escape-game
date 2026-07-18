import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoundTrip } from "./transit";

const origin = { id: "origin", name: "東京", prefecture: "東京都", station: "東京", latitude: 35.68, longitude: 139.76 };
const destination = { id: "destination", name: "避暑地", prefecture: "長野県", station: "入口", latitude: 36.2, longitude: 138.2 };

function journey(departure: string, arrival: string, mode = "rail") {
  const seconds = (clock: string) => {
    const [hours, minutes] = clock.split(":").map(Number);
    return (hours * 60 + minutes) * 60;
  };
  return {
    departureSecs: seconds(departure),
    arrivalSecs: seconds(arrival),
    durationSecs: seconds(arrival) - seconds(departure),
    transferCount: 1,
    accessWalkSecs: 300,
    egressWalkSecs: 300,
    legs: [{ kind: "transit", routeName: "テスト線", mode, departureSecs: seconds(departure), arrivalSecs: seconds(arrival) }],
  };
}

function mockTransit(outbound = [journey("07:30", "09:30")], inbound = [journey("18:00", "21:00")]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const journeys = url.searchParams.get("type") === "departure" ? outbound : inbound;
    return new Response(JSON.stringify({ journeys }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("round-trip time conditions", () => {
  it("uses departure and return-by as actual route constraints", async () => {
    mockTransit();
    const possible = await fetchRoundTrip(origin, destination, "2026-07-18", "07:00", "22:00");
    expect(possible.status).toBe("available");
    expect(possible.stayMinutes).toBe(510);

    const tooLate = await fetchRoundTrip(origin, destination, "2026-07-18", "08:00", "22:00");
    expect(tooLate).toMatchObject({ status: "unavailable", reason: "no_outbound" });

    const tooEarlyHome = await fetchRoundTrip(origin, destination, "2026-07-18", "07:00", "20:00");
    expect(tooEarlyHome).toMatchObject({ status: "unavailable", reason: "no_inbound" });
  });

  it("rejects a route that leaves less than the minimum stay", async () => {
    mockTransit([journey("14:00", "17:00")], [journey("18:00", "21:00")]);
    const result = await fetchRoundTrip(origin, destination, "2026-07-18", "07:00", "22:00", 120);
    expect(result).toMatchObject({ status: "unavailable", reason: "insufficient_stay", stayMinutes: 60 });
  });

  it("only enables flights after the user allows them", async () => {
    const fetchMock = mockTransit([journey("07:30", "09:00", "air")], [journey("18:00", "20:00", "air")]);
    await fetchRoundTrip(origin, destination, "2026-07-18", "07:00", "22:00", 120, false);
    await fetchRoundTrip(origin, destination, "2026-07-18", "07:00", "22:00", 120, true);
    const avoidModes = fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get("avoidModes"));
    expect(avoidModes.slice(0, 2)).toEqual(["air,ferry", "air,ferry"]);
    expect(avoidModes.slice(2, 4)).toEqual(["ferry", "ferry"]);
  });
});
