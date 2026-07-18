import { describe, expect, it } from "vitest";
import { scoreCandidate, type ScoreInput } from "./scoring";

const base: ScoreInput = {
  originApparentTemperature: 35,
  destinationApparentTemperature: 27,
  precipitationProbability: 10,
  windSpeed: 5,
  distanceKm: 100,
  destinationCategories: ["water"],
  walking: "medium",
  requestedWalking: "medium",
};

describe("scoreCandidate", () => {
  it("rewards a larger apparent-temperature difference", () => {
    expect(scoreCandidate(base)).toBeGreaterThan(scoreCandidate({ ...base, destinationApparentTemperature: 32 }));
  });

  it("rewards a matching preference and penalizes rain", () => {
    const match = scoreCandidate({ ...base, preference: "water" });
    const wetMismatch = scoreCandidate({ ...base, preference: "forest", precipitationProbability: 90 });
    expect(match).toBeGreaterThan(wetMismatch);
  });

  it("does not change across repeated calls", () => {
    expect(scoreCandidate(base)).toBe(scoreCandidate(base));
  });
});
