import generatedData from "./generated-destinations.json";
import { destinations as curatedDestinations } from "./destinations";
import { applyDestinationReview, isPublishedDestination } from "./reviewed-destinations";
import type { Destination } from "./types";

interface GeneratedCatalog {
  version: number;
  generatedAt: string;
  sourceSnapshotAt: string;
  license: string;
  attribution: string;
  sourceUrl: string;
  inputs?: Array<{ file: string; sha256: string }>;
  placeCount: number;
  prefectureCount: number;
  cellCount: number;
  places: Destination[];
}

const generated = generatedData as GeneratedCatalog;
if (generated.version !== 1
  || generated.placeCount !== generated.places.length
  || generated.placeCount < 1_000
  || generated.prefectureCount !== 47
  || generated.cellCount < 500) {
  throw new Error("invalid_destination_catalog");
}

export const destinationCatalog: readonly Destination[] = [
  ...curatedDestinations.map((destination) => applyDestinationReview({
    ...destination,
    id: `curated:${destination.id}`,
    sourceId: `curated:${destination.id}`,
    sourceUrl: destination.tourismUrl,
    confidence: "derived" as const,
  })),
  ...generated.places.map(applyDestinationReview),
];

export const destinationById = new Map(destinationCatalog.map((destination) => [destination.id, destination]));
const actionableDestinations = destinationCatalog.filter(isPublishedDestination);
const reviewedPublishedDestinations = actionableDestinations.filter((destination) => destination.review?.state === "published");
const actionableGeneratedDestinations = actionableDestinations.filter((destination) => !destination.id.startsWith("curated:"));

export const DESTINATION_CATALOG_METADATA = {
  version: `osm-${generated.sourceSnapshotAt.slice(0, 10)}-v${generated.version}-reviews${destinationCatalog.filter((destination) => destination.review).length}`,
  generatedAt: generated.generatedAt,
  sourceSnapshotAt: generated.sourceSnapshotAt,
  placeCount: destinationCatalog.length,
  generatedPlaceCount: generated.placeCount,
  prefectureCount: generated.prefectureCount,
  cellCount: generated.cellCount,
  attribution: generated.attribution,
  sourceUrl: generated.sourceUrl,
  license: generated.license,
  reviewedCount: destinationCatalog.filter((destination) => destination.review).length,
  reviewedPublishedCount: destinationCatalog.filter((destination) => destination.review?.state === "published").length,
  reviewedBlockedCount: destinationCatalog.filter((destination) => destination.review && destination.review.state !== "published").length,
  actionablePlaceCount: actionableDestinations.length,
  actionableGeneratedPlaceCount: actionableGeneratedDestinations.length,
  actionablePrefectureCount: new Set(actionableDestinations.map((destination) => destination.prefecture)).size,
  officialLinkCount: actionableDestinations.filter((destination) => !destination.tourismUrl.includes("openstreetmap.org")).length,
  accessPointCount: actionableDestinations.filter((destination) => destination.routePoint).length,
  reviewedAccessEvidenceCount: reviewedPublishedDestinations.filter((destination) => destination.review?.accessEvidenceUrl).length,
  reviewedCoolingEvidenceCount: reviewedPublishedDestinations.filter((destination) => destination.review?.coolingAttributes.length).length,
} as const;
