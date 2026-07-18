import { describe, expect, it } from "vitest";
import weatherCells from "./japan-weather-cells.json";
import generated from "./generated-destinations.json";
import { DESTINATION_CATALOG_METADATA, destinationCatalog } from "./destination-catalog";
import { isPublishedDestination, reviewedDestinationOverrides } from "./reviewed-destinations";
import { localCoolingAttributes } from "./types";

const places = generated.places as Array<{ id: string; cellId: string; sourceUrl: string }>;

describe("generated destination catalog", () => {
  it("covers Japan with real source-linked places", () => {
    expect(generated.placeCount).toBeGreaterThanOrEqual(1_000);
    expect(generated.prefectureCount).toBe(47);
    expect(generated.cellCount).toBeGreaterThanOrEqual(500);
    expect(new Set(places.map((place) => place.id)).size).toBe(generated.placeCount);
    const validCells = new Set(weatherCells.cells.map((cell) => cell.id));
    expect(places.every((place) => validCells.has(place.cellId))).toBe(true);
    expect(places.every((place) => place.sourceUrl.startsWith("https://www.openstreetmap.org/"))).toBe(true);
  });
});

describe("editorially reviewed destinations", () => {
  it("keeps generated coverage separate from actionable published places", () => {
    expect(DESTINATION_CATALOG_METADATA.generatedPlaceCount).toBe(2_216);
    expect(DESTINATION_CATALOG_METADATA.reviewedCount).toBe(401);
    expect(destinationCatalog.filter((destination) => destination.id.startsWith("curated:") && destination.review)).toHaveLength(113);
    expect(DESTINATION_CATALOG_METADATA.reviewedPublishedCount).toBeGreaterThanOrEqual(180);
    expect(DESTINATION_CATALOG_METADATA.reviewedBlockedCount).toBe(DESTINATION_CATALOG_METADATA.reviewedCount - DESTINATION_CATALOG_METADATA.reviewedPublishedCount);
    expect(DESTINATION_CATALOG_METADATA.actionablePlaceCount).toBe(DESTINATION_CATALOG_METADATA.reviewedPublishedCount);
    expect(DESTINATION_CATALOG_METADATA.actionableGeneratedPlaceCount).toBe(158);
    expect(DESTINATION_CATALOG_METADATA.officialLinkCount).toBe(DESTINATION_CATALOG_METADATA.actionablePlaceCount);
    expect(DESTINATION_CATALOG_METADATA.accessPointCount).toBe(DESTINATION_CATALOG_METADATA.actionablePlaceCount);
    expect(DESTINATION_CATALOG_METADATA.reviewedAccessEvidenceCount).toBe(DESTINATION_CATALOG_METADATA.actionablePlaceCount);
    expect(Object.values(reviewedDestinationOverrides).filter(({ review }) => review.state === "published")).toHaveLength(DESTINATION_CATALOG_METADATA.actionablePlaceCount);
  });

  it("only publishes destinations with an official page and a route entrance", () => {
    const published = destinationCatalog.filter(isPublishedDestination);
    expect(published.length).toBeGreaterThanOrEqual(180);
    expect(published.every((destination) => destination.routePoint)).toBe(true);
    expect(published.every((destination) => !destination.tourismUrl.startsWith("https://www.openstreetmap.org/"))).toBe(true);

    const newlyReviewed = published.filter((destination) => destination.review?.state === "published");
    expect(newlyReviewed).toHaveLength(published.length);
    expect(newlyReviewed.every((destination) => destination.review!.officialUrl === destination.tourismUrl)).toBe(true);
    expect(newlyReviewed.every((destination) => Boolean(destination.review!.accessEvidenceUrl))).toBe(true);
    expect(newlyReviewed.every((destination) => destination.review!.coolingAttributes.every((attribute) => (localCoolingAttributes as readonly string[]).includes(attribute)))).toBe(true);
    expect(newlyReviewed.every((destination) => destination.review!.coolingScope && destination.review!.claimLevel)).toBe(true);
    expect(newlyReviewed.filter((destination) => destination.review!.coolingAttributes.includes("spring")).every((destination) => destination.review!.coolingScope === "water-contact")).toBe(true);
    expect(newlyReviewed.filter((destination) => destination.review!.coolingAttributes.includes("cave")).every((destination) => destination.review!.coolingScope === "enclosed-space")).toBe(true);
  });

  it("never promotes blocked or merged records even when generated data has a route point", () => {
    const rejected = destinationCatalog.filter((destination) => destination.review && destination.review.state !== "published");
    expect(rejected.length).toBe(DESTINATION_CATALOG_METADATA.reviewedBlockedCount);
    expect(rejected.every((destination) => !isPublishedDestination(destination))).toBe(true);
  });
});
