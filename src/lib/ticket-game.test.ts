import { describe, expect, it } from "vitest";
import { createTicketGame, discardCurrentTicket, drawTicket, escapeWithCurrentTicket, MAX_DRAWS } from "./ticket-game";

const candidates = Array.from({ length: 12 }, (_, index) => ({
	id: `place-${index + 1}`,
	distanceKm: 30 + index * 20,
	score: 100 - index,
}));

describe("ticket game", () => {
	it("creates five destinations and one heat ticket deterministically", () => {
		const first = createTicketGame(candidates, "daily-seed");
		const second = createTicketGame(candidates, "daily-seed");
		expect(first).toEqual(second);
		expect(first.tickets).toHaveLength(6);
		expect(first.tickets.filter((ticket) => ticket.kind === "destination")).toHaveLength(5);
		expect(first.tickets.filter((ticket) => ticket.kind === "heat")).toHaveLength(1);
		expect(first.tickets.filter((ticket) => ticket.kind === "destination" && ticket.ticketClass === "unknown")).toHaveLength(3);
	});

	it("reveals a destination, discards it, and escapes with another", () => {
		let state = createTicketGame(candidates, "decision-seed");
		const destinations = state.tickets.filter((ticket) => ticket.kind === "destination");
		state = drawTicket(state, destinations[0].id);
		expect(state.phase).toBe("decision");
		state = discardCurrentTicket(state);
		expect(state.phase).toBe("ready");
		state = drawTicket(state, destinations[1].id);
		state = escapeWithCurrentTicket(state);
		expect(state.phase).toBe("escaped");
		expect(state.escapedCandidateId).toBe(destinations[1].candidateId);
	});

	it("heat burns the farthest remaining destination", () => {
		let state = createTicketGame(candidates, "heat-seed");
		const heat = state.tickets.find((ticket) => ticket.kind === "heat")!;
		const farthest = state.tickets.filter((ticket) => ticket.kind === "destination").toSorted((a, b) => b.distanceKm - a.distanceKm)[0];
		state = drawTicket(state, heat.id);
		expect(state.heatHits).toBe(1);
		expect(state.tickets.find((ticket) => ticket.id === farthest.id)?.status).toBe("burned");
	});

	it("does not allow discarding the last draw", () => {
		let state = createTicketGame(candidates, "last-draw-seed");
		for (let draw = 0; draw < MAX_DRAWS; draw += 1) {
			const destination = state.tickets.find((ticket) => ticket.kind === "destination" && ticket.status === "hidden")!;
			state = drawTicket(state, destination.id);
			if (draw < MAX_DRAWS - 1) state = discardCurrentTicket(state);
		}
		expect(discardCurrentTicket(state)).toEqual(state);
	});
});
