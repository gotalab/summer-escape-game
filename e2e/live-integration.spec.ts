import { expect, test } from "@playwright/test";

test("live exploration returns an actionable ticket deck", async ({ request }) => {
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
	const response = await request.post("/api/explore", { data: query });
	expect(response.status(), await response.text()).toBe(200);
	const result = await response.json() as {
		ok?: boolean;
		ticketCandidates?: Array<{ id: string; officialUrl: string; accessSummary?: string }>;
		candidatePoolCount?: number;
		weatherSnapshot?: { mode?: string; sampleCount?: number };
	};
	expect(result.ok).toBe(true);
	expect(result.candidatePoolCount).toBeGreaterThanOrEqual(90);
	expect(result.weatherSnapshot?.sampleCount).toBe(180);
	expect(result.ticketCandidates?.length).toBeGreaterThanOrEqual(5);
	expect(result.ticketCandidates?.every((item) => item.officialUrl.startsWith("https://") && !item.officialUrl.includes("openstreetmap.org"))).toBe(true);

	const routes = await request.post("/api/routes", {
		data: { ...query, destinationIds: result.ticketCandidates!.slice(0, 3).map(({ id }) => id), allowAir: false },
	});
	expect(routes.status(), await routes.text()).toBe(200);
	const routeBody = await routes.json() as { routes?: Array<{ route?: { status?: string; reason?: string } }> };
	expect(routeBody.routes).toHaveLength(3);
	expect(routeBody.routes?.every(({ route }) => route?.status === "available" || route?.status === "unavailable")).toBe(true);
});
