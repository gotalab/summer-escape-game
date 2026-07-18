import { describe, expect, it } from "vitest";
import { FORECAST_SAMPLE_LIMIT, forecastCellSamples, JAPAN_WEATHER_CELL_METADATA, terrainElevationAt, weatherCellSamples } from "./weather-cells";

describe("nationwide weather cells", () => {
	it("keeps one stable forecast sample for every generated cell", () => {
		expect(JAPAN_WEATHER_CELL_METADATA.cellCount).toBe(1_819);
		expect(weatherCellSamples).toHaveLength(JAPAN_WEATHER_CELL_METADATA.cellCount);
		expect(new Set(weatherCellSamples.map((sample) => sample.id)).size).toBe(weatherCellSamples.length);
		expect(new Set(weatherCellSamples.map((sample) => sample.cellId)).size).toBe(weatherCellSamples.length);
	});

	it("provides terrain elevation for ordinary Japanese coordinates", () => {
		expect(terrainElevationAt(35.6812, 139.7671)).not.toBeNull();
	});

	it("keeps the live forecast sample below the open-access minute limit", () => {
		expect(forecastCellSamples).toHaveLength(FORECAST_SAMPLE_LIMIT);
		expect(forecastCellSamples.length).toBeLessThan(600);
		expect(new Set(forecastCellSamples.map((sample) => sample.prefecture)).size).toBe(47);
  // The national sample deliberately balances mountaintops with inhabited
  // lowlands; high points should remain a substantial share, not dominate it.
  expect(forecastCellSamples.filter((sample) => sample.sampleKind === "high-point").length).toBeGreaterThanOrEqual(90);
		expect(forecastCellSamples.filter((sample) => sample.elevationM < 100).length).toBeGreaterThan(20);
		expect(forecastCellSamples.filter((sample) => sample.elevationM > 800).length).toBeGreaterThan(20);
	});

	it("uses nationwide mountain samples without losing lowland samples", () => {
		const highPoints = weatherCellSamples.filter((sample) => sample.sampleKind === "high-point");
		const centers = weatherCellSamples.filter((sample) => sample.sampleKind === "center");
		expect(highPoints.length).toBeGreaterThan(1_000);
		expect(centers.length).toBeGreaterThan(700);
		expect(Math.max(...highPoints.map((sample) => sample.elevationM))).toBeGreaterThan(3_500);
		expect(weatherCellSamples.some((sample) => sample.prefecture === "沖縄県")).toBe(true);
		expect(weatherCellSamples.some((sample) => sample.prefecture === "北海道")).toBe(true);
	});
});
