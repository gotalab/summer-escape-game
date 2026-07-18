import type { Page, Request } from "@playwright/test";
import { exploreErrorFixture, exploreFixture } from "../fixtures/explore";

export const exploreApiPattern = /\/api\/explore(?:\?|$)/;

function answerCount(request: Request): number {
	try {
		const body = request.postDataJSON() as { answers?: unknown[] };
		return Array.isArray(body.answers) ? body.answers.length : 0;
	} catch {
		return 0;
	}
}

export async function stubExplore(page: Page) {
	await page.route(exploreApiPattern, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(exploreFixture(answerCount(route.request()))),
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
				step: 3,
				remainingCount: 0,
				catalogSize: 2316,
				candidatePoolCount: 180,
				eligibleCount: 0,
				question: null,
				mapCandidates: [],
				recommendations: [],
			}),
		});
	});
}
