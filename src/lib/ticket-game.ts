export const TICKET_COUNT = 6;
export const MAX_DRAWS = 3;

export interface TicketGameCandidate {
	id: string;
	distanceKm: number;
	score: number;
}

export type TicketClass = "unknown" | "anchor";
export type TicketStatus = "hidden" | "revealed" | "discarded" | "burned";

export type EscapeTicket =
	| { id: string; kind: "destination"; candidateId: string; distanceKm: number; ticketClass: TicketClass; status: TicketStatus }
	| { id: string; kind: "heat"; status: TicketStatus };

export interface TicketGameState {
	phase: "ready" | "decision" | "escaped";
	tickets: EscapeTicket[];
	drawsUsed: number;
	heatHits: number;
	currentTicketId: string | null;
	escapedCandidateId: string | null;
	message: string;
}

export function createTicketGame(candidates: readonly TicketGameCandidate[], seed: string): TicketGameState {
	const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
	if (unique.length < 5) throw new Error("not_enough_ticket_candidates");
	const ranked = unique.toSorted((left, right) => right.score - left.score || left.id.localeCompare(right.id));
	const anchors = ranked.slice(0, 2);
	const anchorIds = new Set(anchors.map(({ id }) => id));
	const unknown = ranked
		.filter(({ id }) => !anchorIds.has(id))
		.slice(0, 24)
		.toSorted((left, right) => seededRank(`${seed}:unknown`, left.id) - seededRank(`${seed}:unknown`, right.id))
		.slice(0, 3);
	const destinationTickets: EscapeTicket[] = [...unknown.map((candidate) => ({
		id: `ticket:${candidate.id}`,
		kind: "destination" as const,
		candidateId: candidate.id,
		distanceKm: candidate.distanceKm,
		ticketClass: "unknown" as const,
		status: "hidden" as const,
	})), ...anchors.map((candidate) => ({
		id: `ticket:${candidate.id}`,
		kind: "destination" as const,
		candidateId: candidate.id,
		distanceKm: candidate.distanceKm,
		ticketClass: "anchor" as const,
		status: "hidden" as const,
	}))];
	const tickets = [...destinationTickets, { id: "ticket:heat", kind: "heat" as const, status: "hidden" as const }]
		.toSorted((left, right) => seededRank(`${seed}:deck`, left.id) - seededRank(`${seed}:deck`, right.id));
	return {
		phase: "ready",
		tickets,
		drawsUsed: 0,
		heatHits: 0,
		currentTicketId: null,
		escapedCandidateId: null,
		message: "6枚から、今日の逃げ先を引く",
	};
}

export function drawTicket(state: TicketGameState, ticketId: string): TicketGameState {
	if (state.phase !== "ready" || state.drawsUsed >= MAX_DRAWS) return state;
	const selected = state.tickets.find((ticket) => ticket.id === ticketId && ticket.status === "hidden");
	if (!selected) return state;
	const drawsUsed = state.drawsUsed + 1;
	if (selected.kind === "destination") {
		return {
			...state,
			phase: "decision",
			drawsUsed,
			currentTicketId: selected.id,
			tickets: updateTicket(state.tickets, selected.id, "revealed"),
			message: drawsUsed >= MAX_DRAWS ? "最後の切符。この場所へ逃げる" : "ここで逃げるか、切符を捨てて賭けるか",
		};
	}

	let tickets = updateTicket(state.tickets, selected.id, "revealed");
	const farthest = tickets
		.filter((ticket): ticket is Extract<EscapeTicket, { kind: "destination" }> => ticket.kind === "destination" && ticket.status === "hidden")
		.toSorted((left, right) => right.distanceKm - left.distanceKm)[0];
	if (farthest && tickets.filter((ticket) => ticket.kind === "destination" && ticket.status === "hidden").length > 1) {
		tickets = updateTicket(tickets, farthest.id, "burned");
	}
	const base = {
		...state,
		tickets,
		drawsUsed,
		heatHits: state.heatHits + 1,
		message: farthest ? "猛暑が接近。いちばん遠い逃げ先が飲み込まれた" : "猛暑が接近。残りの切符から逃げ先を選ぶ",
	};
	return drawsUsed >= MAX_DRAWS ? forceNearestDecision(base) : base;
}

export function discardCurrentTicket(state: TicketGameState): TicketGameState {
	if (state.phase !== "decision" || !state.currentTicketId || state.drawsUsed >= MAX_DRAWS) return state;
	return {
		...state,
		phase: "ready",
		tickets: updateTicket(state.tickets, state.currentTicketId, "discarded"),
		currentTicketId: null,
		message: "その切符は戻らない。残りからもう1枚引く",
	};
}

export function escapeWithCurrentTicket(state: TicketGameState): TicketGameState {
	if (state.phase !== "decision" || !state.currentTicketId) return state;
	const ticket = state.tickets.find((candidate) => candidate.id === state.currentTicketId);
	if (!ticket || ticket.kind !== "destination") return state;
	return {
		...state,
		phase: "escaped",
		escapedCandidateId: ticket.candidateId,
		message: "逃げ先を確保した",
	};
}

function forceNearestDecision(state: TicketGameState): TicketGameState {
	const nearest = state.tickets
		.filter((ticket): ticket is Extract<EscapeTicket, { kind: "destination" }> => ticket.kind === "destination" && ticket.status === "hidden")
		.toSorted((left, right) => left.distanceKm - right.distanceKm)[0];
	if (!nearest) return state;
	return {
		...state,
		phase: "decision",
		currentTicketId: nearest.id,
		tickets: updateTicket(state.tickets, nearest.id, "revealed"),
		message: "猛暑で遠くへ行けない。最寄りの逃げ先が最後の切符になった",
	};
}

function updateTicket(tickets: readonly EscapeTicket[], id: string, status: TicketStatus): EscapeTicket[] {
	return tickets.map((ticket) => ticket.id === id ? { ...ticket, status } : ticket);
}

function seededRank(seed: string, value: string): number {
	let hash = 2166136261;
	for (const character of `${seed}\u0000${value}`) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
