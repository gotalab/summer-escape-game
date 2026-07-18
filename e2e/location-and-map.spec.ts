import { expect, test } from "@playwright/test";
import { stubExplore } from "./helpers/explore-route";
import { stubTemperatureMap } from "./helpers/temperature-route";

test.beforeEach(async ({ page }) => stubTemperatureMap(page));

test("現在地を許可すると実座標を出発地として使える", async ({ context, page }) => {
	await context.grantPermissions(["geolocation"]);
	await context.setGeolocation({ latitude: 35.6812, longitude: 139.7671 });
	await page.goto("/");

	await page.getByTestId("use-current-location").click();
	await expect(page.getByTestId("location-status")).toContainText("現在地");
});

test("現在地を拒否しても既存の出発地を維持し、架空の位置を使わない", async ({ page }) => {
	await page.addInitScript(() => {
		(window as typeof window & { __locationCalls?: number }).__locationCalls = 0;
		const denied = {
			getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback | null) => {
				(window as typeof window & { __locationCalls?: number }).__locationCalls = ((window as typeof window & { __locationCalls?: number }).__locationCalls ?? 0) + 1;
				error?.({ code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
			},
			watchPosition: () => 0,
			clearWatch: () => undefined,
		};
		Object.defineProperty(navigator, "geolocation", { configurable: true, value: denied });
	});
	await stubExplore(page);
	await page.goto("/");
	const departure = page.getByTestId("departure-select");
	const before = await departure.inputValue();

	await page.getByTestId("use-current-location").click();

	await expect(page.getByTestId("location-status")).toContainText("許可");
	await expect(departure).toHaveValue(before);
	await page.getByTestId("search-button").click();
	await expect(page.getByTestId("escape-ticket")).toHaveCount(6);
	expect(await page.evaluate(() => (window as typeof window & { __locationCalls?: number }).__locationCalls)).toBe(1);
});

test("地図を拡大・縮小し、現在地を中心にリセットできる", async ({ page }) => {
	await stubExplore(page);
	await page.goto("/?seed=qa-0");
	await expect(page.getByText(/地球地図日本（国土地理院）を加工して作成/)).toBeVisible();
	await page.getByTestId("search-button").click();
	await expect(page.getByTestId("escape-ticket")).toHaveCount(6);
	const map = page.getByTestId("tide-map");

	const initialZoom = await map.getAttribute("data-zoom");
	expect(initialZoom).not.toBeNull();
	await page.getByTestId("map-zoom-in").click();
	await expect(map).not.toHaveAttribute("data-zoom", initialZoom ?? "");
	const zoomed = await map.getAttribute("data-zoom");

	await page.getByTestId("map-zoom-out").click();
	await expect(map).not.toHaveAttribute("data-zoom", zoomed ?? "");
	await page.getByTestId("map-zoom-in").click();
	await page.getByTestId("map-reset").click();
	await expect(map).toHaveAttribute("data-zoom", "1");
});
