import { describe, expect, it } from "vitest";
import generated from "./generated-destinations.json";
import reviewBatch from "./generated-destination-reviews-37-60.json";
import { destinationById } from "./destination-catalog";
import { isPublishedDestination, reviewedDestinationOverrides } from "./reviewed-destinations";

const candidates = generated.places
  .filter((place) => place.tourismUrl
    && !/openstreetmap\.org|osm\.org/i.test(place.tourismUrl)
    && place.routePoint)
  .slice(36, 60);

const publishedIds = [
  "osm-node-6279933856",
  "osm-node-5210382419",
  "osm-node-6726463588",
  "osm-node-4807613474",
  "osm-node-4899903022",
  "osm-node-4981928663",
  "osm-node-8233533989",
  "osm-node-5583281921",
  "osm-node-4903795422",
];

const forbiddenEvidenceUrl = /openstreetmap\.org|osm\.org|mapillary\.com|google\.[^/]+\/search|bing\.com\/search/i;

describe("generated destination primary-source reviews 37-60", () => {
  it("covers exactly the requested filtered candidates in stable order", () => {
    expect(reviewBatch.reviewedAt).toBe("2026-07-18");
    expect(reviewBatch.reviews).toHaveLength(24);
    expect(reviewBatch.reviews.map(({ ordinal }) => ordinal)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 37),
    );
    expect(reviewBatch.reviews.map(({ id }) => id)).toEqual(candidates.map(({ id }) => id));
    expect(reviewBatch.reviews.map(({ candidateName }) => candidateName)).toEqual(
      candidates.map(({ name }) => name),
    );
  });

  it("records formal identity, access, parking, cooling, conditions, and primary evidence", () => {
    for (const review of reviewBatch.reviews) {
      expect(review.reviewedAt).toBe(reviewBatch.reviewedAt);
      expect(review.prefecture).toMatch(/[都道府県]$/);
      expect(review.accessSummary.length).toBeGreaterThan(0);
      expect(review.parkingSummary.length).toBeGreaterThan(0);
      expect(review.conditions.length).toBeGreaterThan(0);
      expect(review.reason.length).toBeGreaterThan(0);

      const evidenceUrls = [
        review.officialDetailUrl,
        ...review.accessEvidenceUrls,
        ...review.coolingEvidenceUrls,
      ].filter((url): url is string => Boolean(url));
      expect(evidenceUrls.length).toBeGreaterThan(0);
      expect(evidenceUrls.every((url) => url.startsWith("https://"))).toBe(true);
      expect(evidenceUrls.every((url) => !forbiddenEvidenceUrl.test(url))).toBe(true);
    }
  });

  it("promotes only the 9 evidence-complete records", () => {
    const published = reviewBatch.reviews.filter(({ decision }) => decision === "publish");
    const blocked = reviewBatch.reviews.filter(({ decision }) => decision === "block");
    expect(published.map(({ id }) => id)).toEqual(publishedIds);
    expect(blocked).toHaveLength(15);

    for (const review of published) {
      expect(review.officialName).toBeTruthy();
      expect(review.officialDetailUrl).toBeTruthy();
      expect(review.accessEvidenceUrls.length).toBeGreaterThan(0);
      expect(review.coolingAttributes.length).toBeGreaterThan(0);
      expect(review.promotion).toBeDefined();
      expect(review.promotion?.tourismUrl).toBe(review.officialDetailUrl);
      expect(review.promotion?.routePoint).toBeDefined();

      const destination = destinationById.get(review.id);
      expect(destination?.review?.state).toBe("published");
      expect(destination?.confidence).toBe("verified");
      expect(destination && isPublishedDestination(destination)).toBe(true);
    }

    for (const review of blocked) {
      expect(review.promotion).toBeUndefined();
      expect(reviewedDestinationOverrides[review.id].review.state).toBe("blocked");
      const destination = destinationById.get(review.id);
      expect(destination?.confidence).toBe("derived");
      expect(destination && isPublishedDestination(destination)).toBe(false);
    }
  });

  it("normalizes duplicates and incorrect public-route labels", () => {
    const duplicate = reviewBatch.reviews.find(({ ordinal }) => ordinal === 43);
    expect(duplicate?.decision).toBe("block");
    expect(duplicate?.reason).toContain("重複");

    expect(destinationById.get("osm-node-11513260732")?.review?.state).toBe("blocked");
    expect(destinationById.get("osm-node-4903795422")?.station).not.toContain("おびなたの湯");
    expect(destinationById.get("osm-node-5210382419")?.routePoint).toEqual({
      latitude: 36.324478,
      longitude: 136.436087,
    });
  });
});
