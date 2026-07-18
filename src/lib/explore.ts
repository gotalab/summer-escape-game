import { DESTINATION_CATALOG_METADATA, destinationCatalog } from "@/data/destination-catalog";
import type { CoolingClaimLevel, CoolingScope, Destination, DestinationCategory, Origin } from "@/data/types";
import { isPublishedDestination } from "@/data/reviewed-destinations";
import { selectPublishedCandidatePool } from "./candidate-pool";

const TICKET_GAME_DISTANCE_KM = 220;

export interface ExploreQuery { seed?: string }

interface Explorable {
  id: string;
  destination: Destination;
  categories: DestinationCategory[];
  distanceKm: number;
  prefecture: string;
  score: number;
}

export interface ExploreMapCandidate {
  id: string;
  lat: number;
  lon: number;
  active: boolean;
  categories: DestinationCategory[];
  distanceKm: number;
}

export interface ExploreRecommendation {
  id: string;
  name: string;
  prefecture: string;
  lat: number;
  lon: number;
  station: string;
  categories: DestinationCategory[];
  officialUrl: string;
  score: number;
  distanceKm: number;
  reasons: string[];
  mysteryHint: string;
  accessSummary?: string;
  coolingAttributes?: string[];
  coolingScope?: CoolingScope;
  claimLevel?: CoolingClaimLevel;
  seasonalNotes?: string[];
}

export function exploreDestinations(origin: Origin, query: ExploreQuery) {
  const seed = query.seed ?? "default";
  const nearby = selectPublishedCandidatePool(destinationCatalog, origin, TICKET_GAME_DISTANCE_KM, seed);
  const all: Explorable[] = nearby.map(({ destination, distanceKm }) => ({
    id: destination.id,
    destination,
    categories: destination.categories,
    distanceKm,
    prefecture: destination.prefecture,
    score: scoreWithoutForecast(destination, distanceKm),
  }));
  const gamePool = diversityRerank(
    applyDiscoverySpark(all, `${seed}:game-pool`),
    Math.min(32, all.length),
  );
  const activeIds = new Set(gamePool.map((candidate) => candidate.id));
  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    catalogVersion: DESTINATION_CATALOG_METADATA.version,
    origin: { id: origin.id, name: origin.name, lat: origin.latitude, lon: origin.longitude },
    catalogSize: DESTINATION_CATALOG_METADATA.placeCount,
    candidatePoolCount: nearby.length,
    remainingCount: gamePool.length,
    mapCandidates: all.map((candidate): ExploreMapCandidate => ({
      id: candidate.id,
      lat: candidate.destination.latitude,
      lon: candidate.destination.longitude,
      active: activeIds.has(candidate.id),
      categories: candidate.categories,
      distanceKm: candidate.distanceKm,
    })),
    ticketCandidates: finalize(gamePool, seed, 20),
    sources: [{ name: DESTINATION_CATALOG_METADATA.attribution, url: DESTINATION_CATALOG_METADATA.sourceUrl }],
  };
}

function categorySimilarity(left: readonly DestinationCategory[], right: readonly DestinationCategory[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function diversityRerank<T extends Pick<Explorable, "id" | "score" | "prefecture" | "categories" | "distanceKm">>(candidates: readonly T[], limit: number): T[] {
  const remaining = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected: T[] = [];
  const scores = remaining.map((candidate) => candidate.score);
  const min = scores.length ? Math.min(...scores) : 0;
  const range = Math.max(1, (scores.length ? Math.max(...scores) : 0) - min);
  while (remaining.length && selected.length < limit) {
    const ranked = remaining.map((candidate) => {
      const quality = (candidate.score - min) / range;
      const similarity = selected.length ? Math.max(...selected.map((picked) =>
        (picked.prefecture === candidate.prefecture ? .25 : 0)
        + categorySimilarity(picked.categories, candidate.categories) * .55
        + Math.max(0, 1 - Math.abs(picked.distanceKm - candidate.distanceKm) / 300) * .2,
      )) : 0;
      return { candidate, mmr: quality * .68 - similarity * .32 };
    }).sort((a, b) => b.mmr - a.mmr || b.candidate.score - a.candidate.score || a.candidate.id.localeCompare(b.candidate.id));
    const winner = ranked[0].candidate;
    selected.push(winner);
    remaining.splice(remaining.findIndex((candidate) => candidate.id === winner.id), 1);
  }
  return selected;
}

function finalize(candidates: Explorable[], seed: string, limit: number): ExploreRecommendation[] {
  const routeReady = candidates.filter((candidate) => isPublishedDestination(candidate.destination));
  const ordered = diversityRerank(applyDiscoverySpark(routeReady, `${seed}:tickets`), limit);
  return ordered.map((candidate) => {
    const category = categoryLabel(candidate.categories[0]);
    return {
      id: candidate.id,
      name: candidate.destination.name,
      prefecture: candidate.destination.prefecture,
      lat: candidate.destination.latitude,
      lon: candidate.destination.longitude,
      station: candidate.destination.station,
      categories: candidate.categories,
      officialUrl: candidate.destination.tourismUrl ?? candidate.destination.sourceUrl ?? "",
      score: candidate.score,
      distanceKm: Number(candidate.distanceKm.toFixed(1)),
      reasons: [localCoolingReason(candidate.destination) ?? `${category}を楽しめる`],
      mysteryHint: `${category}・約${Math.round(candidate.distanceKm)}km`,
      accessSummary: candidate.destination.review?.accessSummary,
      coolingAttributes: candidate.destination.review?.coolingAttributes,
      coolingScope: candidate.destination.review?.coolingScope,
      claimLevel: candidate.destination.review?.claimLevel,
      seasonalNotes: candidate.destination.review?.seasonalNotes?.slice(0, 2),
    };
  });
}

export function scoreWithoutForecast(destination: Destination, distanceKm: number): number {
  const coolingEvidence = Math.min(3, destination.review?.coolingAttributes.length ?? 0) * 5;
  const verifiedMechanism = destination.review?.claimLevel === "mechanism-verified" || destination.review?.claimLevel === "numeric-verified" ? 8 : 0;
  const access = destination.station || destination.routePoint || destination.access ? 6 : 0;
  const walking = destination.walking === "low" ? 4 : destination.walking === "medium" ? 2 : 0;
  return Number((50 + coolingEvidence + verifiedMechanism + access + walking - Math.min(24, distanceKm * .08)).toFixed(2));
}

export function applyDiscoverySpark<T extends { id: string; score: number }>(candidates: readonly T[], seed: string): T[] {
  return candidates.map((candidate) => ({ ...candidate, score: Number((candidate.score + seededFraction(seed, candidate.id) * 28).toFixed(2)) }));
}

function seededFraction(seed: string, id: string): number {
  let hash = 2_166_136_261;
  for (const character of `${seed}\u0000${id}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16_777_619); }
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffff_ffff;
}

function localCoolingReason(destination: Destination): string | undefined {
  const label = destination.review?.coolingAttributes.map((attribute) => ({
    shade: "木陰", water: "水辺", spring: "湧水", gorge: "峡谷", cave: "洞窟", underground: "地下", indoor: "屋内", breeze: "風", "lake-breeze": "湖風", fog: "海霧", "coastal-current": "冷たい海流", snowfield: "雪渓", "night-cooling": "夜", forest: "森", highland: "高原",
  } as const)[attribute]).filter(Boolean).slice(0, 2).join("・");
  return label ? `${label}の涼しさを公式確認` : undefined;
}

function categoryLabel(category: DestinationCategory | undefined): string {
  return ({ water: "水辺", forest: "森", highland: "高原", coast: "海風", indoor: "屋内", night: "夜風" } as const)[category ?? "forest"];
}
