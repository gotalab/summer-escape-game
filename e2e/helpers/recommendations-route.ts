import type { Page } from "@playwright/test";
import { recommendationsFixture } from "../fixtures/recommendations";

export const recommendationsApiPattern = /\/api\/recommendations(?:\?|$)/;

export async function stubRecommendations(
	page: Page,
	body: unknown = recommendationsFixture,
	status = 200,
) {
	await page.route(recommendationsApiPattern, async (route) => {
		await route.fulfill({
			status,
			contentType: "application/json",
			body: JSON.stringify(body),
		});
	});
}
