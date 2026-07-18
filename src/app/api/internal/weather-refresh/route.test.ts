import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/weather-snapshot", () => ({ refreshWeatherSnapshotRange: refreshMock }));

import { POST } from "./route";

const originalSecret = process.env.WEATHER_REFRESH_SECRET;

function request(body: unknown, token = "test-secret") {
  return new Request("http://localhost/api/internal/weather-refresh", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.WEATHER_REFRESH_SECRET = "test-secret";
  refreshMock.mockReset();
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.WEATHER_REFRESH_SECRET;
  else process.env.WEATHER_REFRESH_SECRET = originalSecret;
});

describe("internal weather refresh", () => {
  it("rejects visitor requests before touching the provider", async () => {
    const response = await POST(request({}, "wrong"));

    expect(response.status).toBe(401);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes and reports several persisted dates through the authenticated boundary", async () => {
    refreshMock.mockResolvedValue([
      { date: "2026-07-18", fetchedAt: "2026-07-18T00:00:00.000Z", samples: [["a", {}]] },
      { date: "2026-07-19", fetchedAt: "2026-07-18T00:00:00.000Z", samples: [["a", {}], ["b", {}]] },
    ]);

    const response = await POST(request({ startDate: "2026-07-18", endDate: "2026-07-19" }));
    const body = await response.json() as { dates: Array<{ date: string; sampleCount: number }> };

    expect(response.status).toBe(200);
    expect(refreshMock).toHaveBeenCalledWith("2026-07-18", "2026-07-19");
    expect(body.dates).toEqual([
      { date: "2026-07-18", sampleCount: 1 },
      { date: "2026-07-19", sampleCount: 2 },
    ]);
  });

  it("rejects a range longer than the provider forecast window", async () => {
    const response = await POST(request({ startDate: "2026-07-01", endDate: "2026-07-31" }));

    expect(response.status).toBe(400);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
