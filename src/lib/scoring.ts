import type { DestinationCategory, WalkingLevel } from "@/data/types";

export interface ScoreInput {
  originApparentTemperature: number;
  destinationApparentTemperature: number;
  precipitationProbability: number;
  windSpeed: number;
  distanceKm: number;
  destinationCategories: readonly DestinationCategory[];
  preference?: DestinationCategory;
  walking: WalkingLevel;
  requestedWalking: WalkingLevel;
}

const walkingRank: Record<WalkingLevel, number> = { low: 0, medium: 1, high: 2 };

/** Deterministic, side-effect-free candidate score. Higher is better. */
export function scoreCandidate(input: ScoreInput): number {
  const cooling = input.originApparentTemperature - input.destinationApparentTemperature;
  const preference = input.preference && input.destinationCategories.includes(input.preference) ? 12 : 0;
  const rainPenalty = input.precipitationProbability * 0.16;
  const distancePenalty = Math.max(0, input.distanceKm - 40) * 0.012;
  const walkingPenalty = Math.max(0, walkingRank[input.walking] - walkingRank[input.requestedWalking]) * 10;
  const breezeBonus = Math.min(input.windSpeed, 18) * 0.12;
  return Number((cooling * 6 + preference + breezeBonus - rainPenalty - distancePenalty - walkingPenalty).toFixed(2));
}
