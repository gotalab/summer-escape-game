import { describe, expect, it } from "vitest";
import type { Destination, Origin } from "@/data/types";
import { destinationCatalog } from "@/data/destination-catalog";
import {
  CANDIDATE_POOL_SIZE,
  PUBLISHED_CANDIDATE_RESERVE,
  selectCandidatePool,
  selectPublishedCandidatePool,
} from "./candidate-pool";
import { isPublishedDestination } from "@/data/reviewed-destinations";

const origin: Origin = { id: "origin", name: "出発地", prefecture: "東京都", station: "", latitude: 35, longitude: 135 };
const catalog: Destination[] = Array.from({ length: 240 }, (_, index) => ({
  id: `place-${index}`,
  name: `場所${index}`,
  prefecture: `県${index % 24}`,
  station: "",
  latitude: 35 + ((index % 12) + 1) * 0.08,
  longitude: 135 + (Math.floor(index / 12) + 1) * 0.08,
  categories: index % 2 ? ["forest"] : ["water"],
  walking: "medium",
  tourismUrl: "https://example.com",
}));

describe("selectCandidatePool", () => {
  it("offers a public-only pool for the recommendation API", () => {
    const tokyo: Origin = {
      id: "tokyo-public",
      name: "東京",
      prefecture: "東京都",
      station: "東京駅",
      latitude: 35.6812,
      longitude: 139.7671,
    };
    const pool = selectPublishedCandidatePool(destinationCatalog, tokyo, 2_500, "published-api-regression");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every(({ destination }) => isPublishedDestination(destination))).toBe(true);
    expect(pool.every(({ destination }) => destination.review?.state !== "blocked")).toBe(true);
		expect(pool).toHaveLength(CANDIDATE_POOL_SIZE);
  });

  it("rotates the newly reviewed destinations through real exploration pools", () => {
    const tokyo: Origin = {
      id: "tokyo-rotation",
      name: "東京",
      prefecture: "東京都",
      station: "東京駅",
      latitude: 35.6812,
      longitude: 139.7671,
    };
    const seen = new Set<string>();
    for (let index = 0; index < 32; index += 1) {
      for (const { destination } of selectPublishedCandidatePool(destinationCatalog, tokyo, 2_500, `catalog-rotation-${index}`)) {
        seen.add(destination.id);
      }
    }
    const latestIds = [
      "curated:hossawa-falls",
      "curated:fujido-cave",
      "curated:fugaku-wind-cave",
      "curated:karuizawa-shiraito-falls",
      "curated:kiyotsukyo-tunnel",
      "curated:ryusendo-cave",
      "curated:toi-gold-mine",
      "curated:besshi-tourist-mine",
      "curated:kakitagawa-spring-park",
      "curated:maekawa-spring",
      "osm-node-758719921",
      "osm-node-4290898703",
      "osm-node-1867165622",
      "osm-node-748060815",
      "osm-node-7594392985",
      "osm-node-10050220018",
      "osm-node-2182946588",
    ];
    expect(latestIds.every((id) => seen.has(id))).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(265);
  });

  it("is stable for the same seed and independent of catalog order", () => {
    const forward = selectCandidatePool(catalog, origin, 900, "seed-12345678").map((item) => item.destination.id);
    const reversed = selectCandidatePool([...catalog].reverse(), origin, 900, "seed-12345678").map((item) => item.destination.id);
    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(CANDIDATE_POOL_SIZE);
  });

  it("changes a meaningful part of the pool with a new seed", () => {
    const first = new Set(selectCandidatePool(catalog, origin, 900, "seed-abcdefgh").map((item) => item.destination.id));
    const second = new Set(selectCandidatePool(catalog, origin, 900, "seed-zxywvuts").map((item) => item.destination.id));
    const overlap = [...first].filter((id) => second.has(id)).length;
    expect(overlap).toBeLessThan(150);
  });

  it("does not let one prefecture dominate the pool", () => {
    const pool = selectCandidatePool(catalog, origin, 900, "seed-balanced");
    const counts = new Map<string, number>();
    for (const item of pool) counts.set(item.destination.prefecture, (counts.get(item.destination.prefecture) ?? 0) + 1);
		expect(Math.max(...counts.values())).toBeLessThanOrEqual(9);
  });

  it("puts newly generated real places into the actual recommendation pool", () => {
    const tokyo: Origin = {
      id: "tokyo",
      name: "東京",
      prefecture: "東京都",
      station: "東京駅",
      latitude: 35.6812,
      longitude: 139.7671,
    };
    const pool = selectCandidatePool(destinationCatalog, tokyo, 2_500, "generated-catalog-regression");
    const generated = pool.filter(({ destination }) => destination.id.startsWith("osm-node-"));

    expect(pool).toHaveLength(CANDIDATE_POOL_SIZE);
    expect(generated.length).toBeGreaterThan(0);
    expect(new Set(generated.map(({ destination }) => destination.prefecture)).size).toBeGreaterThan(1);
    expect(generated.every(({ destination }) => destination.sourceUrl?.startsWith("https://www.openstreetmap.org/"))).toBe(true);
  });

	it("reserves enough reviewed places for an actionable final result", () => {
		const tokyo: Origin = {
			id: "tokyo", name: "東京", prefecture: "東京都", station: "東京駅", latitude: 35.6812, longitude: 139.7671,
		};
		const pool = selectCandidatePool(destinationCatalog, tokyo, 2_500, "published-reserve-regression");
		expect(pool.filter(({ destination }) => destination.confidence === "verified").length).toBeGreaterThanOrEqual(PUBLISHED_CANDIDATE_RESERVE);
	});
});
