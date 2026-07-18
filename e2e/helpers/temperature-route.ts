import type { Page } from "@playwright/test";

export async function stubTemperatureMap(page: Page) {
	await page.route("**/api/temperature-map?*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
				generatedAt: "2026-07-17T03:00:00.000Z",
				snapshot: { date: "2026-07-18", fetchedAt: "2026-07-17T03:00:00.000Z", expiresAt: "2026-07-18T03:00:00.000Z", stale: false, mode: "forecast", sampleCount: 180 },
				grid: { version: 1, resolution: 5, cellCount: 1_819, forecastSampleCount: 180 },
				points: [
					{ id: "hokkaido", lat: 43.1, lon: 142.5, temperatureC: 21 },
					{ id: "tohoku", lat: 39.5, lon: 140.8, temperatureC: 23 },
					{ id: "kanto", lat: 36.0, lon: 139.5, temperatureC: 31 },
					{ id: "chubu", lat: 36.1, lon: 137.4, temperatureC: 22 },
					{ id: "shikoku", lat: 33.7, lon: 133.5, temperatureC: 27 },
					{ id: "okinawa", lat: 26.3, lon: 127.8, temperatureC: 30 },
				],
			}),
		});
	});
}
