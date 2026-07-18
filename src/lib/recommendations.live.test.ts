import { describe, expect, it } from "vitest";
import { getOrigin } from "@/data/origins";
import { createRecommendations } from "./recommendations";

const enabled = process.env.RUN_LIVE_INTEGRATION === "1";

describe.skipIf(!enabled)("live recommendation providers", () => {
  it("uses current Open-Meteo data and reports real transit availability", async () => {
    const origin = getOrigin("tokyo");
    expect(origin).toBeDefined();
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(Date.now() + 86_400_000));
    const result = await createRecommendations(origin!, {
      date,
      depart: "09:00",
      return: "22:00",
      preference: "water",
      walking: "low",
    });
    expect(result.ok).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.sources.map((source) => source.url)).toContain("https://open-meteo.com/");
    expect(result.sources.map((source) => source.url)).toContain("https://api.transit.ls8h.com/");
    expect(result.recommendations.every((item) => item.route.status === "available" || item.route.status === "unavailable")).toBe(true);
    if (result.recommendations.every((item) => item.route.reason === "provider_error")) {
      expect(result.sources.find((source) => source.url.includes("transit.ls8h.com"))?.status).toBe("partial");
    }
  }, 45_000);
});
