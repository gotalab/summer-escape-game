import { describe, expect, it } from "vitest";
import { getOrigin } from "@/data/origins";
import { exploreDestinations } from "./explore";

describe.skipIf(process.env.RUN_LIVE_INTEGRATION !== "1")("live exploration", () => {
  it("builds its first duel from current forecast data", async () => {
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(Date.now() + 86_400_000));
    const result = await exploreDestinations(getOrigin("tokyo")!, { date, depart: "09:00", return: "22:00", answers: [] });
    expect(result.ok).toBe(true);
    expect(result.done).toBe(false);
    expect(result.question?.choices).toHaveLength(2);
    expect(result.mapCandidates.length).toBeGreaterThan(10);
    expect(result.mapCandidates.filter((candidate) => candidate.active)).toHaveLength(result.remainingCount);
    expect(result.sources[0].url).toBe("https://open-meteo.com/");
  }, 20_000);
});

