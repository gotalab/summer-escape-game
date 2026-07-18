export const generatedAt = "2026-07-17T06:00:00.000Z";

const baseCandidates = [
	{
		id: "minakami", name: "水上", prefecture: "群馬県", lat: 36.7792, lon: 138.9688, station: "水上駅",
		categories: ["water", "forest"], officialUrl: "https://example.test/minakami",
		temperatureC: 23, apparentTemperatureC: 22, weatherValueMode: "direct-forecast",
		temperatureDeltaC: -11, precipitationProbability: 10, windSpeedKmh: 8, score: 92,
		reasons: ["東京より11℃涼しい", "川辺で過ごせる"],
		accessSummary: "JR水上駅から川沿いへ徒歩約10分。",
		coolingAttributes: ["water", "forest", "shade"], seasonalNotes: ["増水時は川辺へ近づかない"],
		route: {
			status: "available",
			outbound: { durationMinutes: 138, departure: "09:04", arrival: "11:22", transfers: 1, walkMinutes: 8 },
			return: { durationMinutes: 142, departure: "19:18", arrival: "21:40", transfers: 1, walkMinutes: 8 },
			roundTripMinutes: 280,
		},
	},
	{
		id: "okutama", name: "奥多摩", prefecture: "東京都", lat: 35.8095, lon: 139.0961, station: "奥多摩駅",
		categories: ["water", "forest"], officialUrl: "https://example.test/okutama",
		temperatureC: 25, apparentTemperatureC: 24, weatherValueMode: "direct-forecast",
		temperatureDeltaC: -9, precipitationProbability: 20, windSpeedKmh: 6, score: 84,
		reasons: ["駅から歩いて川辺へ行ける"],
		route: { status: "available", outbound: { durationMinutes: 112 }, roundTripMinutes: 227 },
	},
	{
		id: "karuizawa", name: "軽井沢", prefecture: "長野県", lat: 36.3428, lon: 138.635, station: "軽井沢駅",
		categories: ["forest", "highland"], officialUrl: "https://example.test/karuizawa",
		temperatureC: 22, apparentTemperatureC: 21, weatherValueMode: "direct-forecast",
		temperatureDeltaC: -12, precipitationProbability: 15, windSpeedKmh: 7, score: 89,
		reasons: ["木陰と高原の風を感じられる"],
		route: { status: "available", outbound: { durationMinutes: 78 }, roundTripMinutes: 160 },
	},
] as const;

export const ticketCandidatesFixture = [
	{ ...baseCandidates[0], distanceKm: 128 },
	{ ...baseCandidates[1], distanceKm: 67 },
	{ ...baseCandidates[2], distanceKm: 120 },
	{ ...baseCandidates[0], id: "yoro-keikoku", name: "養老渓谷", prefecture: "千葉県", lat: 35.2384, lon: 140.1857, station: "養老渓谷駅", officialUrl: "https://example.test/yoro-keikoku", score: 80, distanceKm: 72 },
	{ ...baseCandidates[1], id: "nippara-cave", name: "日原鍾乳洞", prefecture: "東京都", lat: 35.8521, lon: 139.0407, station: "奥多摩駅", officialUrl: "https://example.test/nippara-cave", score: 87, distanceKm: 78 },
	{ ...baseCandidates[2], id: "tanzawa-lake", name: "丹沢湖", prefecture: "神奈川県", lat: 35.4139, lon: 139.0465, station: "谷峨駅", officialUrl: "https://example.test/tanzawa-lake", score: 82, distanceKm: 75 },
] as const;
