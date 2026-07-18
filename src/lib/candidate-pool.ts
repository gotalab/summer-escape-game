import type { Destination, Origin } from "@/data/types";
import { isPublishedDestination } from "@/data/reviewed-destinations";
import { haversineKm } from "./geo";

export interface CandidatePoolItem {
  destination: Destination;
  distanceKm: number;
}

export const CANDIDATE_POOL_SIZE = 180;
export const PUBLISHED_CANDIDATE_RESERVE = 60;
const DISTANCE_QUOTAS = [60, 60, 60] as const;

/**
 * Builds a deterministic but seed-varying pool. Sorting by a seeded hash makes
 * the result independent of JSON order; round-robin prefectures keeps one dense
 * metro area from occupying every weather request.
 */
export function selectCandidatePool(
  catalog: readonly Destination[],
  origin: Origin,
  maximumDistance: number,
  seed: string,
): CandidatePoolItem[] {
  const eligible = catalog
    .map((destination) => ({ destination, distanceKm: haversineKm(origin, destination) }))
    .filter(({ distanceKm }) => distanceKm >= 15 && distanceKm <= maximumDistance);
	const published = eligible.filter(({ destination }) => isPublishedDestination(destination));
  const bands = [[], [], []] as CandidatePoolItem[][];
  for (const item of eligible) {
    const ratio = item.distanceKm / maximumDistance;
    bands[ratio <= 0.34 ? 0 : ratio <= 0.67 ? 1 : 2].push(item);
  }
  const selected: CandidatePoolItem[] = [];
  const selectedIds = new Set<string>();
	for (const item of roundRobinPrefectures(published, `${seed}:published`, 0).slice(0, PUBLISHED_CANDIDATE_RESERVE)) {
		selected.push(item);
		selectedIds.add(item.destination.id);
	}
  for (let band = 0; band < bands.length; band += 1) {
		const remainingQuota = Math.max(0, DISTANCE_QUOTAS[band] - selected.filter((item) => {
			const ratio = item.distanceKm / maximumDistance;
			return (ratio <= 0.34 ? 0 : ratio <= 0.67 ? 1 : 2) === band;
		}).length);
		for (const item of roundRobinPrefectures(bands[band].filter(({ destination }) => !selectedIds.has(destination.id)), seed, band).slice(0, remainingQuota)) {
      selected.push(item);
      selectedIds.add(item.destination.id);
    }
  }
  if (selected.length < CANDIDATE_POOL_SIZE) {
    const remainder = eligible
      .filter((item) => !selectedIds.has(item.destination.id))
      .sort((left, right) => seededRank(seed, left.destination.id) - seededRank(seed, right.destination.id) || left.destination.id.localeCompare(right.destination.id));
    selected.push(...remainder.slice(0, CANDIDATE_POOL_SIZE - selected.length));
  }
  return selected.sort((left, right) => left.destination.id.localeCompare(right.destination.id));
}

export function selectPublishedCandidatePool(
  catalog: readonly Destination[],
  origin: Origin,
  maximumDistance: number,
  seed: string,
): CandidatePoolItem[] {
  // Build the whole pool from actionable places. Filtering a mixed pool after
  // selection would let unpublished points drive the questions and counts,
  // only to disappear at the final reveal.
  return selectCandidatePool(
    catalog.filter(isPublishedDestination),
    origin,
    maximumDistance,
    seed,
  );
}

function roundRobinPrefectures(items: CandidatePoolItem[], seed: string, band: number): CandidatePoolItem[] {
  const groups = new Map<string, CandidatePoolItem[]>();
  for (const item of items) groups.set(item.destination.prefecture, [...(groups.get(item.destination.prefecture) ?? []), item]);
  const queues = [...groups.entries()]
    .sort(([left], [right]) => seededRank(`${seed}:${band}`, left) - seededRank(`${seed}:${band}`, right) || left.localeCompare(right))
    .map(([, group]) => group.toSorted((left, right) => seededRank(seed, left.destination.id) - seededRank(seed, right.destination.id) || left.destination.id.localeCompare(right.destination.id)));
  const output: CandidatePoolItem[] = [];
  for (let round = 0; ; round += 1) {
    let found = false;
    for (const queue of queues) {
      const item = queue[round];
      if (!item) continue;
      output.push(item);
      found = true;
    }
    if (!found) return output;
  }
}

function seededRank(seed: string, value: string): number {
  let hash = 2166136261;
  const input = `${seed}\u0000${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
