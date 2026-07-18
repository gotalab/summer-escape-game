import { expect, test } from "@playwright/test";
import { exploreApiPattern, stubExplore, stubExploreEmpty, stubExploreError } from "./helpers/explore-route";
import { stubTemperatureMap } from "./helpers/temperature-route";

test.beforeEach(async ({ page }) => stubTemperatureMap(page));

test.describe("夏の抜け道", () => {
	test("初期画面から何を操作すればよいか分かる", async ({ page }) => {
		await page.goto("/");

		await expect(page.getByTestId("app-title")).toContainText("夏の抜け道");
		await expect(page.getByTestId("departure-select")).toBeVisible();
		await expect(page.locator("footer[aria-label='旅の条件']")).toContainText("07:00 → 22:00");
		await expect(page.getByTestId("date-summary")).toContainText("JST");
		await expect(page.getByTestId("search-button")).toBeEnabled();
	});

	test("出発地を変更できる", async ({ page }) => {
		await page.goto("/");

		const departure = page.getByTestId("departure-select");
		await departure.selectOption({ value: "shinjuku" });
		await expect(departure).toHaveValue("shinjuku");
		await departure.selectOption({ value: "fukuoka" });
		await expect(departure).toHaveValue("fukuoka");
	});

	test("出発時刻と帰宅時刻を自由に変更しAPIへ渡す", async ({ page }) => {
		await stubExplore(page);
		await page.goto("/");

		await page.getByText("07:00 → 22:00").click();
		await page.getByTestId("depart-time").fill("07:30");
		await page.getByTestId("return-time").fill("21:15");
		const requestPromise = page.waitForRequest(exploreApiPattern);
		await page.getByTestId("search-button").click();
		const request = await requestPromise;
		const body = request.postDataJSON() as { depart?: string; return?: string; maxApparentTemperature?: number };

		expect(body.depart).toBe("07:30");
		expect(body.return).toBe("21:15");
		expect(body.maxApparentTemperature).toBe(28);
	});

	test("地図の温度上限が色だけでなく探索条件へ効く", async ({ page }) => {
		await stubExplore(page);
		await page.goto("/");
		await expect(page.getByText("1,819セル ← 180予報")).toBeVisible();

		const temperature = page.getByRole("slider", { name: "探索する日中最高体感温度の上限" });
		await temperature.fill("26");
		await expect(page.getByText("26℃以下を探す")).toBeVisible();
		const requestPromise = page.waitForRequest(exploreApiPattern);
		await page.getByTestId("search-button").click();
		const request = await requestPromise;
		expect((request.postDataJSON() as { maxApparentTemperature?: number }).maxApparentTemperature).toBe(26);
		await expect(page.locator(".result-status span[title]")).toHaveAttribute("title", /2,316地点から現在地周辺の180候補を確認/);
	});

	test("期限切れ直後のブラウザ予報を前回値と明示する", async ({ page }) => {
		await page.route("**/api/temperature-map?*", (route) => route.abort());
		await page.addInitScript(() => {
			const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
			const noon = new Date(`${today}T12:00:00Z`);
			const weekday = noon.getUTCDay();
			noon.setUTCDate(noon.getUTCDate() + (6 - weekday + 7) % 7);
			const date = noon.toISOString().slice(0, 10);
			const expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
			localStorage.setItem(`summer-escape:weather-map:v1:${date}`, JSON.stringify({
				ok: true,
				snapshot: { date, fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), expiresAt, stale: false, mode: "forecast", sampleCount: 180 },
				grid: { cellCount: 1819, forecastSampleCount: 180 },
				points: [[35.68, 139.76, 28]],
			}));
		});
		await page.goto("/");
		await expect(page.getByText("1,819セル ← 180予報（前回）")).toBeVisible();
	});

	test("6枚の切符から逃げ先を引き、実用的な詳細まで進める", async ({ page }) => {
		await stubExplore(page);
		await page.route("**/api/routes", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ routes: [] }) }));
		await page.goto("/?seed=qa-0");
		await page.getByTestId("search-button").click();

		await expect(page.getByTestId("escape-ticket")).toHaveCount(6);
		await expect(page.getByTestId("ticket-game")).toContainText("未知 3");
		await page.getByTestId("escape-ticket").first().click();
		await expect(page.getByTestId("ticket-decision")).toContainText("養老渓谷");
		await expect(page.getByTestId("ticket-decision")).toContainText("約72km");
		await page.getByTestId("escape-with-ticket").click();

		const detail = page.getByTestId("destination-detail");
		await expect(detail).toBeVisible();
		await expect(detail).toContainText("養老渓谷");
		await expect(detail).toContainText("体感 22℃");
		await expect(detail).toContainText("気温 23℃");
		await detail.getByText("この温度について").click();
		await expect(detail).toContainText("地点座標の11〜17時予報");
		await expect(detail).toContainText("2時間18分");
		await expect(detail).toContainText("JR水上駅から川沿いへ徒歩約10分");
		await expect(detail).toContainText("増水時は川辺へ近づかない");
		const directionsHref = await detail.getByTestId("google-maps-directions").getAttribute("href");
		expect(directionsHref).not.toBeNull();
		const directions = new URL(directionsHref!);
		expect(directions.origin + directions.pathname).toBe("https://www.google.com/maps/dir/");
		expect(directions.searchParams.get("origin")).toBe("35.6812,139.7671");
		expect(directions.searchParams.get("destination")).toBe("35.2384,140.1857");
		expect(directions.searchParams.get("travelmode")).toBe("transit");
		await expect(detail.getByRole("link", { name: "公式情報・行き方を見る" })).toHaveAttribute("href", "https://example.test/yoro-keikoku");
	});

	test("猛暑を引くと遠い候補が消え、残った切符から最終地点へ逃げられる", async ({ page }) => {
		await stubExplore(page);
		await page.route("**/api/routes", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ routes: [] }) }));
		await page.goto("/?seed=qa-1");
		await page.getByTestId("search-button").click();

		await page.getByTestId("escape-ticket").first().click();
		await expect(page.getByTestId("ticket-game")).toContainText("猛暑が接近");
		await expect(page.getByTestId("ticket-game")).toContainText("猛暑前線");
		await expect(page.getByTestId("ticket-game")).toContainText("消失");
		await expect(page.locator(".map-stage")).toHaveClass(/heat-is-closing/);

		await page.locator("button[data-testid='escape-ticket']:enabled").first().click();
		await expect(page.getByTestId("ticket-decision")).toBeVisible();
		await page.getByTestId("escape-with-ticket").click();
		await expect(page.getByTestId("destination-detail")).toBeVisible();
	});

	test("APIエラー時に架空の候補を表示しない", async ({ page }) => {
		await stubExploreError(page);
		await page.goto("/");

		await page.getByTestId("search-button").click();

		await expect(page.getByTestId("search-error")).toContainText("確認できません");
		await expect(page.getByTestId("island-card")).toHaveCount(0);
		await expect(page.getByTestId("destination-detail")).toHaveCount(0);
	});

	test("0件でも行き止まりにせず温度条件を広げられる", async ({ page }) => {
		await stubExploreEmpty(page);
		await page.goto("/");
		const temperature = page.getByRole("slider", { name: "探索する日中最高体感温度の上限" });
		await temperature.fill("18");
		await page.getByTestId("search-button").click();
		await expect(page.getByTestId("empty-result")).toContainText("18℃以下は見つかりませんでした");

		const requestPromise = page.waitForRequest(exploreApiPattern);
		await page.getByRole("button", { name: "20℃まで広げる" }).click();
		const request = await requestPromise;
		expect((request.postDataJSON() as { maxApparentTemperature?: number }).maxApparentTemperature).toBe(20);
	});
});
