import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const runLiveIntegration = process.env.RUN_LIVE_INTEGRATION === "1";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	// The SVG mosaic is intentionally visual-heavy. Serial browser QA avoids
	// multiple Chromium renderers competing for CPU on local and CI machines.
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	outputDir: "test-results/playwright",
	use: {
		baseURL,
		launchOptions: executablePath ? { executablePath } : undefined,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: executablePath ? "off" : "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			testIgnore: [/live-integration\.spec\.ts/, /mobile\.spec\.ts/],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chrome",
			testMatch: /mobile\.spec\.ts/,
			use: { ...devices["Pixel 7"] },
		},
		...(runLiveIntegration
			? [
					{
						name: "live-api",
						testMatch: /live-integration\.spec\.ts/,
						use: { ...devices["Desktop Chrome"] },
					},
				]
			: []),
	],
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: "pnpm dev",
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
			},
});
