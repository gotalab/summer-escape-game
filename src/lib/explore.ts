import { DESTINATION_CATALOG_METADATA, destinationCatalog } from "@/data/destination-catalog";
import type { CoolingClaimLevel, CoolingScope, Destination, DestinationCategory, Origin } from "@/data/types";
import { isPublishedDestination } from "@/data/reviewed-destinations";
import { scoreCandidate } from "./scoring";
import { selectPublishedCandidatePool } from "./candidate-pool";
import { WEATHER_SOURCE, type WeatherSummary } from "./weather";
import { getWeatherSnapshot, weatherFromSnapshot, weatherSnapshotMeta, weatherValueMode, type WeatherSnapshotMeta, type WeatherValueMode } from "./weather-snapshot";

const TICKET_GAME_DISTANCE_KM = 220;

export interface ExploreQuery {
  date: string;
  depart: string;
  return: string;
  maxApparentTemperature?: number;
  seed?: string;
}

interface Explorable {
  id: string;
  destination: Destination;
  weather: WeatherSummary;
  categories: DestinationCategory[];
  walking: Destination["walking"];
  distanceKm: number;
  apparentTemperature: number;
  precipitationProbability: number;
  windSpeed: number;
  prefecture: string;
  score: number;
}

export interface ExploreMapCandidate {
  id: string;
  lat: number;
  lon: number;
  temperatureC: number | null;
  weatherValueMode: WeatherValueMode;
  active: boolean;
  categories: DestinationCategory[];
  distanceKm: number;
}

type SourceStatus = { name: string; status: "ok" | "partial"; fetchedAt: string; url: string };

export interface ExploreResponse {
  ok: true;
  generatedAt: string;
  catalogVersion: string;
  origin: { id: string; name: string; lat: number; lon: number; temperatureC: number };
  query: ExploreQuery;
  catalogSize: number;
  candidatePoolCount: number;
  eligibleCount: number;
  weatherSnapshot: WeatherSnapshotMeta;
  remainingCount: number;
  mapCandidates: ExploreMapCandidate[];
  ticketCandidates: ExploreRecommendation[];
  sources: SourceStatus[];
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
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  weatherValueMode: WeatherValueMode;
  temperatureDeltaC: number | null;
  precipitationProbability: number | null;
  windSpeedKmh: number | null;
  score: number;
  distanceKm: number;
  reasons: string[];
  mysteryHint: string;
  accessSummary?: string;
  coolingAttributes?: string[];
  coolingScope?: CoolingScope;
  claimLevel?: CoolingClaimLevel;
  seasonalNotes?: string[];
  route: {
    status: "checking" | "available" | "unavailable";
    outbound?: RouteLeg;
    return?: RouteLeg;
    roundTripMinutes?: number;
    stayMinutes?: number;
    reason?: "no_outbound" | "no_inbound" | "insufficient_stay" | "provider_error" | "access_unverified";
  };
}

type RouteLeg = { durationMinutes: number; departure: string; arrival: string; transfers: number; walkMinutes: number; fareYen?: number; lines: string[] };

export async function exploreDestinations(origin: Origin, query: ExploreQuery): Promise<ExploreResponse> {
  const generatedAt = new Date().toISOString();
  const nearby = selectPublishedCandidatePool(destinationCatalog, origin, TICKET_GAME_DISTANCE_KM, query.seed ?? "default");
  const weatherSnapshot = await getWeatherSnapshot(query.date);
  const weather = weatherFromSnapshot(weatherSnapshot, [origin, ...nearby.map(({ destination }) => destination)]);
  const originWeather = weather.get(origin.id);
  if (!originWeather) throw new Error("origin_weather_unavailable");
  const all = nearby.flatMap(({ destination, distanceKm }): Explorable[] => {
    const current = weather.get(destination.id);
    if (!current) return [];
    return [{
      id: destination.id,
      destination,
      weather: current,
      categories: destination.categories,
      walking: destination.walking,
      distanceKm,
      apparentTemperature: current.apparentTemperature,
      precipitationProbability: current.precipitationProbability,
      windSpeed: current.windSpeed,
      prefecture: destination.prefecture,
      score: weatherSnapshot.mode === "forecast" ? scoreCandidate({
        originApparentTemperature: originWeather.apparentTemperature,
        destinationApparentTemperature: current.apparentTemperature,
        precipitationProbability: current.precipitationProbability,
        windSpeed: current.windSpeed,
        distanceKm,
        destinationCategories: destination.categories,
        walking: destination.walking,
        requestedWalking: "high",
      }) : scoreWithoutForecast(destination, distanceKm),
    }];
  });
  // Terrain-only values are deliberately rough and must not eliminate most of
  // the game before the first choice. When a real forecast snapshot is
  // unavailable, keep the full reviewed pool in play so the repository still
  // delivers its three-choice core loop without an external weather call.
  const temperatureEligible = weatherSnapshot.mode === "forecast"
    ? filterByMaxApparentTemperature(all, query.maxApparentTemperature)
    : all;
  // Each play starts with one fixed local deck. A seeded spark keeps repeat
  // plays varied while the diversity pass avoids six near-identical places.
  const gamePool = diversityRerank(
    applyDiscoverySpark(temperatureEligible, `${query.seed ?? "default"}:game-pool`),
    Math.min(32, temperatureEligible.length),
  ) as Explorable[];
  const activeIds = new Set(gamePool.map((candidate) => candidate.id));
  const mapCandidates = all.map((candidate): ExploreMapCandidate => ({
    id: candidate.id,
    lat: candidate.destination.latitude,
    lon: candidate.destination.longitude,
    temperatureC: weatherSnapshot.mode === "forecast" ? candidate.weather.apparentTemperature : null,
    weatherValueMode: weatherValueMode(weatherSnapshot, candidate.id),
    active: activeIds.has(candidate.id),
    categories: candidate.destination.categories,
    distanceKm: candidate.distanceKm,
  }));
  const sources: SourceStatus[] = [
    { name: weatherSnapshot.mode === "forecast" ? WEATHER_SOURCE.name : "地形・標高による涼しさ目安", status: weatherSnapshot.mode === "forecast" && !weatherSnapshot.stale ? "ok" : "partial", fetchedAt: weatherSnapshot.fetchedAt, url: WEATHER_SOURCE.url },
    { name: DESTINATION_CATALOG_METADATA.attribution, status: "ok", fetchedAt: DESTINATION_CATALOG_METADATA.generatedAt, url: DESTINATION_CATALOG_METADATA.sourceUrl },
  ];
  const ticketCandidates = finalize(gamePool, origin, originWeather, weatherSnapshot, `${query.seed ?? "default"}:tickets`, 20);
  return {
    ok: true,
    generatedAt,
    catalogVersion: DESTINATION_CATALOG_METADATA.version,
    origin: { id: origin.id, name: origin.name, lat: origin.latitude, lon: origin.longitude, temperatureC: originWeather.temperature },
    query,
    catalogSize: DESTINATION_CATALOG_METADATA.placeCount,
    candidatePoolCount: nearby.length,
    eligibleCount: temperatureEligible.length,
    weatherSnapshot: weatherSnapshotMeta(weatherSnapshot),
    remainingCount: gamePool.length,
    mapCandidates,
    ticketCandidates,
    sources,
  };
}

function categorySimilarity(left: readonly DestinationCategory[], right: readonly DestinationCategory[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

/** Maximal-marginal-relevance selection: quality first, then different experiences. */
function diversityRerank<T extends Pick<Explorable, "id" | "score" | "prefecture" | "categories" | "distanceKm">>(candidates: readonly T[], limit = 3): T[] {
  const remaining = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected: T[] = [];
  const scores = remaining.map((candidate) => candidate.score);
  const min = scores.length ? Math.min(...scores) : 0;
  const range = Math.max(1, (scores.length ? Math.max(...scores) : 0) - min);
  while (remaining.length && selected.length < limit) {
    const ranked = remaining.map((candidate) => {
      const quality = (candidate.score - min) / range;
      const similarity = selected.length ? Math.max(...selected.map((picked) => {
        const samePrefecture = picked.prefecture === candidate.prefecture ? 0.25 : 0;
        const category = categorySimilarity(picked.categories, candidate.categories) * 0.55;
        const distance = Math.max(0, 1 - Math.abs(picked.distanceKm - candidate.distanceKm) / 300) * 0.2;
        return samePrefecture + category + distance;
      })) : 0;
      return { candidate, mmr: quality * 0.68 - similarity * 0.32 };
    }).sort((a, b) => b.mmr - a.mmr || b.candidate.score - a.candidate.score || a.candidate.id.localeCompare(b.candidate.id));
    const winner = ranked[0].candidate;
    selected.push(winner);
    remaining.splice(remaining.findIndex((candidate) => candidate.id === winner.id), 1);
  }
  return selected;
}

export function filterByMaxApparentTemperature<T extends { apparentTemperature: number }>(
  candidates: readonly T[],
  maximum?: number,
): T[] {
  return maximum === undefined
    ? [...candidates]
    : candidates.filter((candidate) => candidate.apparentTemperature <= maximum);
}

function finalize(candidates: Explorable[], origin: Origin, originWeather: WeatherSummary, snapshot: Awaited<ReturnType<typeof getWeatherSnapshot>>, seed: string, limit = 3): ExploreRecommendation[] {
  if (!candidates.length) return [];
  // Do not present a remote point as a day-trip recommendation when its
  // generated record has no credible station, bus stop, or nearby parking
  // anchor. The route API still makes the final feasibility decision.
  // OSM element pages are provenance, not a reason to visit. Until a generated
  // place is editorially reviewed, it can appear in the discovery field but
  // never as one of the three actionable travel recommendations.
  const routeReady = candidates.filter((candidate) => isPublishedDestination(candidate.destination));
  // Every result still obeys the selected temperature ceiling.
  // A small seeded spark rotates near-equivalent places so the same famous
  // destination does not win every otherwise-identical play.
  const ordered = diversityRerank(applyDiscoverySpark(routeReady, seed), limit) as Explorable[];
  return ordered.map((candidate) => {
    const cooling = originWeather.apparentTemperature - candidate.weather.apparentTemperature;
    const category = categoryLabel(candidate.categories[0]);
    const valueMode = weatherValueMode(snapshot, candidate.id);
    const isTerrainEstimate = valueMode === "terrain-estimate";
    return {
      id: candidate.id,
      name: candidate.destination.name,
      prefecture: candidate.destination.prefecture,
      lat: candidate.destination.latitude,
      lon: candidate.destination.longitude,
      station: candidate.destination.station,
      categories: candidate.destination.categories,
      officialUrl: candidate.destination.tourismUrl ?? candidate.destination.sourceUrl ?? "",
      temperatureC: isTerrainEstimate ? null : candidate.weather.temperature,
      apparentTemperatureC: isTerrainEstimate ? null : candidate.weather.apparentTemperature,
      weatherValueMode: valueMode,
      temperatureDeltaC: isTerrainEstimate ? null : Number((originWeather.temperature - candidate.weather.temperature).toFixed(1)),
      precipitationProbability: isTerrainEstimate ? null : candidate.weather.precipitationProbability,
      windSpeedKmh: isTerrainEstimate ? null : candidate.weather.windSpeed,
      score: candidate.score,
      distanceKm: Number(candidate.distanceKm.toFixed(1)),
      reasons: [
        ...(!isTerrainEstimate && cooling >= 1 ? [`${origin.name}より日中最高体感が${Math.round(cooling)}℃低い`] : []),
        localCoolingReason(candidate.destination) ?? `${category}を楽しめる`,
        ...(!isTerrainEstimate && candidate.weather.precipitationProbability <= 20 ? ["雨の可能性が低い"] : []),
      ].slice(0, 3),
      mysteryHint: isTerrainEstimate
        ? `${category}・冷却根拠を公式確認・約${Math.round(candidate.distanceKm)}km`
        : `${category}・${valueMode === "direct-forecast" ? "地点予報" : "周辺予報目安"}${Math.round(candidate.weather.apparentTemperature)}℃・約${Math.round(candidate.distanceKm)}km`,
      accessSummary: candidate.destination.review?.accessSummary,
      coolingAttributes: candidate.destination.review?.coolingAttributes,
      coolingScope: candidate.destination.review?.coolingScope,
      claimLevel: candidate.destination.review?.claimLevel,
      seasonalNotes: candidate.destination.review?.seasonalNotes?.slice(0, 2),
      route: { status: "checking" },
    };
  });
}

/** Rank a fallback deck only by facts that remain true without today's weather. */
export function scoreWithoutForecast(destination: Destination, distanceKm: number): number {
  const coolingEvidence = Math.min(3, destination.review?.coolingAttributes.length ?? 0) * 5;
  const verifiedMechanism = destination.review?.claimLevel === "mechanism-verified"
    || destination.review?.claimLevel === "numeric-verified" ? 8 : 0;
  const access = destination.station || destination.routePoint || destination.access ? 6 : 0;
  const walking = destination.walking === "low" ? 4 : destination.walking === "medium" ? 2 : 0;
  const distancePenalty = Math.min(24, distanceKm * 0.08);
  return Number((50 + coolingEvidence + verifiedMechanism + access + walking - distancePenalty).toFixed(2));
}

export function applyDiscoverySpark<T extends { id: string; score: number }>(candidates: readonly T[], seed: string): T[] {
  return candidates.map((candidate) => ({
    ...candidate,
    // Once a place passed the user's hard temperature and answer filters,
    // discovery matters more than preserving tiny score differences. This
    // range can rotate roughly five apparent-temperature degrees, while the
    // selected maximum temperature remains an absolute ceiling.
    score: Number((candidate.score + seededFraction(seed, candidate.id) * 28).toFixed(2)),
  }));
}

function seededFraction(seed: string, id: string): number {
  let hash = 2_166_136_261;
  for (const character of `${seed}\u0000${id}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x7feb352d);
	hash ^= hash >>> 15;
	hash = Math.imul(hash, 0x846ca68b);
	hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffff_ffff;
}

function localCoolingReason(destination: Destination): string | undefined {
  const label = destination.review?.coolingAttributes
    .map((attribute) => ({
      shade: "木陰",
      water: "水辺",
      spring: "湧水",
      gorge: "峡谷",
      cave: "洞窟",
      underground: "地下",
      indoor: "屋内",
      breeze: "風",
      "lake-breeze": "湖風",
      fog: "海霧",
      "coastal-current": "冷たい海流",
      snowfield: "雪渓",
      "night-cooling": "夜の放射冷却",
      forest: "森",
      highland: "高原",
    } as const)[attribute])
    .filter(Boolean)
    .slice(0, 2)
    .join("・");
  if (!label) return undefined;
  if (destination.review?.coolingScope === "water-contact") return `${label}に触れる局所体験`;
  if (destination.review?.coolingScope === "enclosed-space") return `${label}内の涼しさを公式確認`;
  if (destination.review?.coolingScope === "time-shift") return `${label}に楽しめる時間帯`;
  return `${label}の局所条件を公式確認`;
}

function categoryLabel(category: DestinationCategory | undefined): string {
  return ({ water: "水辺", forest: "森", highland: "高原", coast: "海風", indoor: "屋内", night: "夜風" } as const)[category ?? "forest"];
}
