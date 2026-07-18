import { expect, test } from "@playwright/test";
import { stubExplore } from "./helpers/explore-route";
import { stubTemperatureMap } from "./helpers/temperature-route";

test.beforeEach(async ({ page }) => stubTemperatureMap(page));

test("モバイルでも6枚の切符から詳細まで画面内で操作できる", async ({ page }) => {
	await stubExplore(page);
	await page.route("**/api/routes", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ routes: [] }) }));
	await page.goto("/?seed=qa-0");

	await expect(page.getByTestId("app-title")).toBeVisible();
	await expect(page.getByTestId("departure-select")).toBeInViewport();
	await expect(page.getByTestId("search-button")).toBeInViewport();
	await page.getByTestId("search-button").click();
	const tickets = page.getByTestId("escape-ticket");
	await expect(tickets).toHaveCount(6);
	await tickets.first().scrollIntoViewIfNeeded();
	await tickets.first().click();
	await page.getByTestId("escape-with-ticket").click();

	const detail = page.getByTestId("destination-detail");
	await expect(detail).toBeVisible();
	await detail.scrollIntoViewIfNeeded();
	await expect(detail).toBeInViewport();
	const googleDirections = detail.getByTestId("google-maps-directions");
	await googleDirections.scrollIntoViewIfNeeded();
	await expect(googleDirections).toBeInViewport();
	await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
