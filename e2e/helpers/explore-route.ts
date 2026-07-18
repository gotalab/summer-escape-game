import type { Page } from "@playwright/test";
import { exploreErrorFixture, exploreFixture } from "../fixtures/explore";

export const exploreApiPattern = /\/api\/explore(?:\?|$)/;

export async function stubExplore(page: Page) {
	await page.route(exploreApiPattern, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(exploreFixture()),
		});
	});
}

export async function stubExploreError(page: Page) {
	await page.route(exploreApiPattern, async (route) => {
		await route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify(exploreErrorFixture),
		});
	});
}

export async function stubExploreEmpty(page: Page) {
	await page.route(exploreApiPattern, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
				generatedAt: "2026-07-17T06:00:00.000Z",
				remainingCount: 0,
				catalogSize: 2316,
				candidatePoolCount: 180,
				eligibleCount: 0,
				mapCandidates: [],
				ticketCandidates: [],
			}),
		});
	});
}
