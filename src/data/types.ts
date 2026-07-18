export const destinationCategories = [
  "water",
  "forest",
  "highland",
  "coast",
  "indoor",
  "night",
] as const;

export type DestinationCategory = (typeof destinationCategories)[number];
export type WalkingLevel = "low" | "medium" | "high";

export const localCoolingAttributes = [
  "shade",
  "water",
  "spring",
  "gorge",
  "cave",
  "underground",
  "indoor",
  "breeze",
  "lake-breeze",
  "fog",
  "coastal-current",
  "snowfield",
  "night-cooling",
  "forest",
  "highland",
] as const;

export type LocalCoolingAttribute = (typeof localCoolingAttributes)[number];

export const coolingScopes = [
  "ambient-air",
  "local-microclimate",
  "enclosed-space",
  "water-contact",
  "time-shift",
  "indoor-fallback",
] as const;

export type CoolingScope = (typeof coolingScopes)[number];

export const coolingClaimLevels = [
  "numeric-verified",
  "mechanism-verified",
  "forecast-only",
  "no-cooling-claim",
] as const;

export type CoolingClaimLevel = (typeof coolingClaimLevels)[number];

export interface DestinationReview {
  state: "published" | "blocked" | "merged";
  reviewedAt: string;
  officialUrl?: string;
  accessEvidenceUrl?: string;
  accessSummary?: string;
  parkingSummary?: string;
  evidenceUrls?: string[];
  coolingAttributes: LocalCoolingAttribute[];
  /** What is actually cooled; water temperature must never become air temperature. */
  coolingScope?: CoolingScope;
  /** Controls whether UI copy may show a number, a mechanism, or forecast only. */
  claimLevel?: CoolingClaimLevel;
  thermalEvidence?: Array<{
    subject: "ambient-air" | "water" | "enclosed-air";
    valueC: number;
    qualifier?: string;
    sourceUrl: string;
  }>;
  seasonalNotes?: string[];
  reason: string;
  mergedInto?: string;
}

export interface PlacePoint {
  id: string;
  name: string;
  prefecture: string;
  station: string;
  latitude: number;
  longitude: number;
}

export interface Destination extends PlacePoint {
  categories: DestinationCategory[];
  walking: WalkingLevel;
  tourismUrl: string;
  cellId?: string;
  elevationM?: number;
  sourceId?: string;
  sourceUrl?: string;
  confidence?: "verified" | "derived";
  routePoint?: { latitude: number; longitude: number };
  review?: DestinationReview;
  access?: {
    name: string;
    latitude: number;
    longitude: number;
    kind: "station" | "bus-stop" | "parking";
    distanceKm: number;
    sourceUrl: string;
  };
}

export type Origin = PlacePoint;
