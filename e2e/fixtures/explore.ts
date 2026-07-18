import { generatedAt, ticketCandidatesFixture } from "./ticket-candidates";

export function exploreFixture() {
	return {
		ok: true,
		generatedAt,
		remainingCount: 32,
		catalogSize: 2316,
		candidatePoolCount: 180,
		eligibleCount: 72,
		weatherSnapshot: {
			date: "2026-07-18",
			fetchedAt: "2026-07-17T06:00:00.000Z",
			expiresAt: "2026-07-17T12:00:00.000Z",
			stale: false,
			mode: "forecast",
			sampleCount: 180,
		},
		ticketCandidates: ticketCandidatesFixture,
	};
}

export const exploreErrorFixture = {
	ok: false,
	generatedAt,
	error: {
		code: "UPSTREAM_UNAVAILABLE",
		message: "最新の予報と交通情報を確認できませんでした。",
	},
} as const;
