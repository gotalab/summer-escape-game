import { DESTINATION_CATALOG_METADATA, destinationCatalog } from "@/data/destination-catalog";
import type { CoolingClaimLevel, CoolingScope, DestinationCategory, WalkingLevel } from "@/data/types";
import { scoreCandidate } from "./scoring";
import { selectPublishedCandidatePool } from "./candidate-pool";
import { fetchRoundTrip, TRANSIT_SOURCE, type RoundTrip } from "./transit";
import { WEATHER_SOURCE, type WeatherSummary } from "./weather";
import { getWeatherSnapshot, weatherFromSnapshot, weatherSnapshotMeta, weatherValueMode, type WeatherSnapshotMeta, type WeatherValueMode } from "./weather-snapshot";
import type { Origin } from "@/data/types";

const JAPAN_WIDE_DISTANCE_KM = 2_500;

export interface RecommendationQuery {
  date: string;
  depart: string;
  return: string;
  preference?: DestinationCategory;
  walking: WalkingLevel;
}

export interface RecommendationItem {
  id: string;
  name: string;
  prefecture: string;
  station: string;
  lat: number;
  lon: number;
  categories: DestinationCategory[];
  walking: WalkingLevel;
  officialUrl: string;
  distanceKm: number;
  score: number;
  temperatureC: number;
  apparentTemperatureC: number;
  weatherValueMode: WeatherValueMode;
  temperatureDeltaC: number;
  precipitationProbability: number;
  windSpeedKmh: number;
  reasons: string[];
  coolingScope?: CoolingScope;
  claimLevel?: CoolingClaimLevel;
  route: {
    status: "available" | "unavailable";
    outbound?: { durationMinutes: number; departure: string; arrival: string; transfers: number; walkMinutes: number; fareYen?: number; lines: string[]; usesAir: boolean };
    return?: { durationMinutes: number; departure: string; arrival: string; transfers: number; walkMinutes: number; fareYen?: number; lines: string[]; usesAir: boolean };
    roundTripMinutes?: number;
    stayMinutes?: number;
    reason?: RoundTrip["reason"];
  };
}

export interface RecommendationResponse {
  ok: true;
  query: RecommendationQuery & { originId: string };
  origin: { id: string; name: string; lat: number; lon: number; temperatureC: number };
  recommendations: RecommendationItem[];
  generatedAt: string;
  catalogSize: number;
  evaluatedDestinations: number;
  rankingMode: "forecast-ranked" | "unordered-estimate";
  weatherSnapshot: WeatherSnapshotMeta;
  sources: Array<{ name: string; status: "ok" | "partial"; fetchedAt: string; url: string }>;
}

export async function createRecommendations(origin: Origin, query: RecommendationQuery): Promise<RecommendationResponse> {
  const nearby = selectPublishedCandidatePool(destinationCatalog, origin, JAPAN_WIDE_DISTANCE_KM, `${origin.id}:${query.date}:${query.depart}:${query.return}`);

  const weatherSnapshot = await getWeatherSnapshot(query.date);
  const weather = weatherFromSnapshot(weatherSnapshot, [origin, ...nearby.map(({ destination }) => destination)]);
  const originWeather = weather.get(origin.id);
  if (!originWeather) throw new Error("origin_weather_unavailable");

  const scored = nearby.flatMap(({ destination, distanceKm }) => {
    const destinationWeather = weather.get(destination.id);
    if (!destinationWeather) return [];
    return [{
      destination,
      distanceKm,
      destinationWeather,
      score: scoreCandidate({
        originApparentTemperature: originWeather.apparentTemperature,
        destinationApparentTemperature: destinationWeather.apparentTemperature,
        precipitationProbability: destinationWeather.precipitationProbability,
        windSpeed: destinationWeather.windSpeed,
        distanceKm,
        destinationCategories: destination.categories,
        preference: query.preference,
        walking: destination.walking,
        requestedWalking: query.walking,
      }),
    }];
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  const transit: RoundTrip[] = await Promise.all(scored.map(({ destination }): Promise<RoundTrip> => {
    if (!destination.routePoint) return Promise.resolve({ status: "unavailable", roundTripPossible: false, reason: "access_unverified" });
    return fetchRoundTrip(origin, { ...destination, latitude: destination.routePoint.latitude, longitude: destination.routePoint.longitude }, query.date, query.depart, query.return);
  }));
  const fetchedAt = weatherSnapshot.fetchedAt;
  const includeForecastClaims = weatherSnapshot.mode === "forecast";
  const recommendations = scored.map(({ destination, destinationWeather, distanceKm, score }, index): RecommendationItem => ({
    id: destination.id,
    name: destination.name,
    prefecture: destination.prefecture,
    station: destination.station,
    lat: destination.latitude,
    lon: destination.longitude,
    categories: destination.categories,
    walking: destination.walking,
    officialUrl: destination.tourismUrl ?? destination.sourceUrl ?? "",
    distanceKm: Math.round(distanceKm),
    score,
    temperatureC: destinationWeather.temperature,
    apparentTemperatureC: destinationWeather.apparentTemperature,
    weatherValueMode: weatherValueMode(weatherSnapshot, destination.id),
    temperatureDeltaC: Number((originWeather.temperature - destinationWeather.temperature).toFixed(1)),
    precipitationProbability: destinationWeather.precipitationProbability,
    windSpeedKmh: destinationWeather.windSpeed,
    reasons: buildReasons(origin.name, originWeather, destinationWeather, destination.categories, query.preference, includeForecastClaims),
    coolingScope: destination.review?.coolingScope,
    claimLevel: destination.review?.claimLevel,
    route: {
      status: transit[index].status,
      outbound: transit[index].outbound ? routeLeg(transit[index].outbound!) : undefined,
      return: transit[index].inbound ? routeLeg(transit[index].inbound!) : undefined,
      roundTripMinutes: transit[index].outbound && transit[index].inbound ? transit[index].outbound!.durationMinutes + transit[index].inbound!.durationMinutes : undefined,
      stayMinutes: transit[index].stayMinutes,
      reason: transit[index].reason,
    },
  })).sort((a, b) => Number(b.route.status === "available") - Number(a.route.status === "available") || b.score - a.score);

  return {
    ok: true,
    query: { ...query, originId: origin.id },
    origin: { id: origin.id, name: origin.name, lat: origin.latitude, lon: origin.longitude, temperatureC: originWeather.temperature },
    recommendations,
    generatedAt: new Date().toISOString(),
    catalogSize: destinationCatalog.length,
    evaluatedDestinations: nearby.length,
    rankingMode: includeForecastClaims ? "forecast-ranked" : "unordered-estimate",
    weatherSnapshot: weatherSnapshotMeta(weatherSnapshot),
    sources: [
      { name: weatherSnapshot.mode === "forecast" ? WEATHER_SOURCE.name : "地形・標高による涼しさ目安", status: weatherSnapshot.mode === "forecast" && !weatherSnapshot.stale ? "ok" : "partial", fetchedAt, url: WEATHER_SOURCE.url },
      { name: TRANSIT_SOURCE.name, status: transit.some((route) => route.reason === "provider_error") ? "partial" : "ok", fetchedAt, url: TRANSIT_SOURCE.url },
      { name: DESTINATION_CATALOG_METADATA.attribution, status: "ok", fetchedAt: DESTINATION_CATALOG_METADATA.generatedAt, url: DESTINATION_CATALOG_METADATA.sourceUrl },
    ],
  };
}

function routeLeg(leg: NonNullable<RoundTrip["outbound"]>) {
	return { durationMinutes: leg.durationMinutes, departure: leg.departure, arrival: leg.arrival, transfers: leg.transfers, walkMinutes: leg.walkingMinutes, fareYen: leg.fareYen, lines: leg.lines, usesAir: leg.usesAir };
}

function buildReasons(originName: string, origin: WeatherSummary, destination: WeatherSummary, categories: DestinationCategory[], preference: DestinationCategory | undefined, includeForecastClaims: boolean): string[] {
  const cooling = origin.apparentTemperature - destination.apparentTemperature;
  const labels: Partial<Record<DestinationCategory, string>> = { water: "水辺で過ごせる", forest: "木陰と森がある", highland: "高原の空気を楽しめる", coast: "海風を感じられる", indoor: "屋内でも過ごせる", night: "夕方から楽しめる" };
  return [
    ...(includeForecastClaims && cooling >= 1 ? [`${originName}より体感温度が${Math.round(cooling)}℃低い`] : []),
    ...(preference && categories.includes(preference) ? [labels[preference] ?? "好みに合う"] : []),
    ...(includeForecastClaims && destination.precipitationProbability <= 20 ? ["雨の可能性が低い"] : []),
  ].slice(0, 3);
}
