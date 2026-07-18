import { describe, expect, it } from "vitest";
import type { Destination } from "@/data/types";
import { applyDiscoverySpark, filterByMaxApparentTemperature, scoreWithoutForecast } from "./explore";

describe("exploration temperature condition", () => {
  const candidates = [
    { id: "cool", apparentTemperature: 24.8 },
    { id: "edge", apparentTemperature: 28 },
    { id: "hot", apparentTemperature: 31.2 },
  ];

  it("uses the map temperature control as an inclusive recommendation ceiling", () => {
    expect(filterByMaxApparentTemperature(candidates, 28).map(({ id }) => id)).toEqual(["cool", "edge"]);
    expect(filterByMaxApparentTemperature(candidates, 24).map(({ id }) => id)).toEqual([]);
    expect(filterByMaxApparentTemperature(candidates).map(({ id }) => id)).toEqual(["cool", "edge", "hot"]);
  });
});

describe("fallback deck ranking", () => {
  const base: Destination = {
    id: "place", name: "逃げ先", prefecture: "東京都", station: "駅",
    latitude: 35.7, longitude: 139.7, categories: ["forest"],
    walking: "low" as const, tourismUrl: "https://example.test/place",
  };

  it("uses verified cooling evidence and distance without synthetic weather", () => {
    const verified = {
      ...base,
      review: {
        state: "published" as const,
        reviewedAt: "2026-07-18",
        coolingAttributes: ["shade" as const, "forest" as const],
        claimLevel: "mechanism-verified" as const,
        reason: "official",
      },
    };
    expect(scoreWithoutForecast(verified, 60)).toBeGreaterThan(scoreWithoutForecast(base, 60));
    expect(scoreWithoutForecast(verified, 60)).toBeGreaterThan(scoreWithoutForecast(verified, 200));
  });
});

describe("seeded discovery spark", () => {
  it("rotates near-equivalent winners without changing the candidate set", () => {
    const candidates = Array.from({ length: 24 }, (_, index) => ({ id: `place-${index}`, score: 80 - index * 0.15 }));
    const winners = Array.from({ length: 20 }, (_, index) =>
      applyDiscoverySpark(candidates, `play-${index}`).toSorted((left, right) => right.score - left.score)[0].id,
    );
    expect(new Set(winners).size).toBeGreaterThanOrEqual(8);
    expect(applyDiscoverySpark(candidates, "same-seed")).toEqual(applyDiscoverySpark(candidates, "same-seed"));
    expect(new Set(applyDiscoverySpark(candidates, "same-seed").map(({ id }) => id))).toEqual(new Set(candidates.map(({ id }) => id)));
  });
});
