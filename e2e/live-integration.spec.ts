import { expect, test } from "@playwright/test";

test("live recommendations API returns traceable source data or an explicit error", async ({ request }) => {
	const tomorrowInJapan = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
		new Date(Date.now() + 86_400_000),
	);
	const query = new URLSearchParams({
		originId: "tokyo",
		date: process.env.LIVE_TEST_DATE ?? tomorrowInJapan,
		depart: "09:00",
		return: "22:00",
		preference: "water",
		walking: "low",
	});
	const response = await request.get(`/api/recommendations?${query}`);

	expect(response.status(), await response.text()).toBe(200);
	const body: unknown = await response.json();
	expect(body).toEqual(expect.objectContaining({ generatedAt: expect.any(String) }));

	const result = body as {
		ok?: boolean;
		generatedAt: string;
		sources?: Array<{ status?: string; fetchedAt?: string }>;
		error?: { code?: string; message?: string };
	};
	expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);

	if (result.ok) {
		expect(result.sources?.length).toBeGreaterThan(0);
		for (const source of result.sources ?? []) {
			expect(source.status).toBeTruthy();
			expect(Number.isNaN(Date.parse(source.fetchedAt ?? ""))).toBe(false);
		}
	} else {
		expect(result.error).toEqual(
			expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
		);
	}
});

test("live exploration reaches actionable places through three real questions", async ({ request }) => {
	test.setTimeout(60_000);
	const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(Date.now() + 86_400_000));
	const query = {
		originId: "tokyo",
		date,
		depart: "07:00",
		return: "22:00",
		maxApparentTemperature: 34,
		seed: "live-browser-proof-20260718",
	};
	const answers: Array<{ questionId: string; choiceId: string }> = [];
	let result: {
		ok?: boolean;
		question?: { id: string; choices: Array<{ id: string }> } | null;
		recommendations?: Array<{ id: string; officialUrl: string; accessSummary?: string }>;
		candidatePoolCount?: number;
		weatherSnapshot?: { mode?: string; sampleCount?: number };
	} = {};
	for (let step = 0; step <= 3; step += 1) {
		const response = await request.post("/api/explore", { data: { ...query, answers } });
		expect(response.status(), await response.text()).toBe(200);
		result = await response.json();
		expect(result.ok).toBe(true);
		if (!result.question) break;
		answers.push({ questionId: result.question.id, choiceId: result.question.choices[0].id });
	}

	expect(answers).toHaveLength(3);
	expect(result.candidatePoolCount).toBeGreaterThanOrEqual(90);
	expect(result.weatherSnapshot?.sampleCount).toBe(180);
	expect(result.recommendations?.length).toBeGreaterThan(0);
	expect(result.recommendations?.every((item) => item.officialUrl.startsWith("https://") && !item.officialUrl.includes("openstreetmap.org"))).toBe(true);

	const routes = await request.post("/api/routes", {
		data: { ...query, destinationIds: result.recommendations!.map(({ id }) => id), allowAir: false },
	});
	expect(routes.status(), await routes.text()).toBe(200);
	const routeBody = await routes.json() as { routes?: Array<{ route?: { status?: string; reason?: string } }> };
	expect(routeBody.routes).toHaveLength(result.recommendations!.length);
	expect(routeBody.routes?.every(({ route }) => route?.status === "available" || route?.status === "unavailable")).toBe(true);
});
