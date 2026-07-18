import { generatedAt, recommendationsFixture, ticketCandidatesFixture } from "./recommendations";

const questions = [
	{
		id: "coolness",
		prompt: "どちらの涼しさ？",
		choices: [
			{ id: "water", label: "水辺" },
			{ id: "forest", label: "森" },
		],
	},
	{
		id: "pace",
		prompt: "どちらの過ごし方？",
		choices: [
			{ id: "easy", label: "のんびり" },
			{ id: "active", label: "冒険" },
		],
	},
	{
		id: "discovery",
		prompt: "どちらの出会い？",
		choices: [
			{ id: "classic", label: "定番" },
			{ id: "surprise", label: "知らない場所" },
		],
	},
] as const;

export const exploreCounts = [32, 16, 8, 3] as const;

export function exploreFixture(step: number) {
	const safeStep = Math.max(0, Math.min(step, 3));
	return {
		ok: true,
		generatedAt,
		step: safeStep,
		remainingCount: exploreCounts[safeStep],
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
		question: safeStep < questions.length ? questions[safeStep] : undefined,
		recommendations: safeStep === 3 ? recommendationsFixture.recommendations : undefined,
		ticketCandidates: ticketCandidatesFixture,
		sources: safeStep === 3 ? recommendationsFixture.sources : undefined,
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
