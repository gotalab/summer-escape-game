import cellData from "./japan-weather-cells.json";
import type { PlacePoint } from "./types";
import { latLngToCell } from "h3-js";

export type WeatherCellSampleKind = "center" | "high-point";

export interface JapanWeatherCell {
	id: string;
	lat: number;
	lon: number;
	group: "main" | "hokkaido" | "okinawa" | "pacific-islands";
	prefectures: string[];
	elevationM: number;
	elevationRangeM: number;
	highPoint: { lat: number; lon: number; elevationM: number } | null;
}

export interface WeatherCellSample extends PlacePoint {
	cellId: string;
	sampleKind: WeatherCellSampleKind;
	elevationM: number;
}

const payload = cellData as {
	version: number;
	generatedAt: string;
	resolution: number;
	cellCount: number;
	cells: JapanWeatherCell[];
};

const terrainCellById = new Map(payload.cells.map((cell) => [cell.id, cell]));

if (payload.version !== 1 || payload.cellCount !== payload.cells.length || payload.cells.length < 1_000) {
	throw new Error("invalid_japan_weather_cells");
}

export const JAPAN_WEATHER_CELL_METADATA = {
	version: payload.version,
	generatedAt: payload.generatedAt,
	resolution: payload.resolution,
	cellCount: payload.cellCount,
} as const;

/**
 * Every nationwide cell contributes exactly one forecast coordinate. Mountainous
 * cells use their terrain high point so inland cool pockets are not averaged away.
 */
export const weatherCellSamples: WeatherCellSample[] = payload.cells.map((cell) => {
	const useHighPoint = cell.highPoint !== null
		&& cell.highPoint.elevationM >= 400
		&& cell.highPoint.elevationM - cell.elevationM >= 250;
	const sample = useHighPoint ? cell.highPoint! : { lat: cell.lat, lon: cell.lon, elevationM: cell.elevationM };
	return {
		id: `${cell.id}:${useHighPoint ? "high" : "center"}`,
		cellId: cell.id,
		sampleKind: useHighPoint ? "high-point" : "center",
		name: `全国気温セル ${cell.id}`,
		prefecture: cell.prefectures[0] ?? "日本",
		station: "",
		latitude: sample.lat,
		longitude: sample.lon,
		elevationM: sample.elevationM,
	};
});

export const FORECAST_SAMPLE_LIMIT = 180;

/**
 * Live observations are sampled across the whole country, then interpolated
 * back onto every map cell. 180 samples keep the opening map to two batched
 * upstream requests instead of triggering rate limits on the public API.
 */
function selectForecastSamples(samples: WeatherCellSample[]): WeatherCellSample[] {
	const selected: WeatherCellSample[] = [];
	const selectedIds = new Set<string>();
	// Keep a mid-elevation and a high-elevation observation in every prefecture
	// before using a denser national pattern. Choosing only each area's highest
	// point would make the nationwide heat mosaic systematically too cool.
	const prefectures = new Map<string, WeatherCellSample[]>();
	for (const sample of samples) prefectures.set(sample.prefecture, [...(prefectures.get(sample.prefecture) ?? []), sample]);
	for (const samplesInPrefecture of prefectures.values()) {
		const ordered = samplesInPrefecture.toSorted((left, right) => left.elevationM - right.elevationM || left.id.localeCompare(right.id));
		for (const sample of [ordered[Math.floor(ordered.length / 2)], ordered.at(-1)]) {
			if (!sample || selectedIds.has(sample.id)) continue;
			selected.push(sample);
			selectedIds.add(sample.id);
		}
	}
	const buckets = new Map<string, WeatherCellSample[]>();
	for (const sample of samples) {
		const key = `${Math.floor(sample.latitude * 2)}:${Math.floor(sample.longitude * 2)}`;
		buckets.set(key, [...(buckets.get(key) ?? []), sample]);
	}
	const groups = [...buckets.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, group]) => terrainBalancedOrder(group));
	for (let round = 0; selected.length < Math.min(FORECAST_SAMPLE_LIMIT, samples.length); round += 1) {
		let found = false;
		for (const group of groups) {
			const sample = group[round];
			if (!sample || selectedIds.has(sample.id)) continue;
			selected.push(sample);
			selectedIds.add(sample.id);
			found = true;
			if (selected.length === FORECAST_SAMPLE_LIMIT) break;
		}
		if (!found) break;
	}
	return selected;
}

function terrainBalancedOrder(group: WeatherCellSample[]): WeatherCellSample[] {
	const ordered = group.toSorted((left, right) => left.elevationM - right.elevationM || left.id.localeCompare(right.id));
	const priorityIndexes = [
		Math.floor(ordered.length / 2),
		ordered.length - 1,
		0,
		Math.floor(ordered.length * .75),
		Math.floor(ordered.length * .25),
	];
	const priority = priorityIndexes.flatMap((index) => ordered[index] ? [ordered[index]] : []);
	const priorityIds = new Set(priority.map(({ id }) => id));
	return [...priority.filter((sample, index) => priority.findIndex(({ id }) => id === sample.id) === index), ...ordered.filter(({ id }) => !priorityIds.has(id))];
}

export const forecastCellSamples = selectForecastSamples(weatherCellSamples);

/** Approximate ground elevation for records that do not carry a measured POI elevation. */
export function terrainElevationAt(latitude: number, longitude: number): number | null {
	return terrainCellById.get(latLngToCell(latitude, longitude, payload.resolution))?.elevationM ?? null;
}
