"use client";

import { ArrowRight, Flame, RotateCcw, Ticket as TicketIcon } from "lucide-react";
import type { TicketGameState } from "@/lib/ticket-game";
import { MAX_DRAWS } from "@/lib/ticket-game";
import type { Destination } from "./summer-escape";

type Props = {
	game: TicketGameState;
	destinations: Destination[];
	onDraw: (ticketId: string) => void;
	onDiscard: () => void;
	onEscape: () => void;
};

export function TicketGamePanel({ game, destinations, onDraw, onDiscard, onEscape }: Props) {
	const byId = new Map(destinations.map((destination) => [destination.id, destination]));
	const current = game.tickets.find((ticket) => ticket.id === game.currentTicketId);
	const destination = current?.kind === "destination" ? byId.get(current.candidateId) : null;
	const hidden = game.tickets.filter((ticket) => ticket.status === "hidden");
	const unknown = hidden.filter((ticket) => ticket.kind === "destination" && ticket.ticketClass === "unknown").length;
	const anchors = hidden.filter((ticket) => ticket.kind === "destination" && ticket.ticketClass === "anchor").length;
	const heat = hidden.filter((ticket) => ticket.kind === "heat").length;
	const remainingTurns = Math.max(0, MAX_DRAWS - game.drawsUsed);

	return <section className={`ticket-game phase-${game.phase}`} aria-label="逃げ先切符ゲーム" data-testid="ticket-game">
		<header className="ticket-game-head">
			<div><strong>{game.phase === "escaped" ? "逃げ先を確保" : `猛暑到達まで ${remainingTurns}ターン`}</strong><span aria-live="polite">{game.message}</span></div>
			<div className="ticket-composition"><small>残りの切符</small><b>未知 {unknown}</b><b>本命 {anchors}</b><b className="heat-count">猛暑 {heat}</b></div>
		</header>

		<div className="ticket-row" data-testid="ticket-row">
			{game.tickets.map((ticket, index) => {
				const revealedDestination = ticket.kind === "destination" ? byId.get(ticket.candidateId) : null;
				const canDraw = game.phase === "ready" && ticket.status === "hidden";
				return <button
					key={ticket.id}
					type="button"
					className={`escape-ticket is-${ticket.status} is-${ticket.kind}`}
					disabled={!canDraw}
					onClick={() => onDraw(ticket.id)}
					data-testid="escape-ticket"
					aria-label={canDraw ? `${index + 1}枚目の切符を引く` : ticket.kind === "heat" && ticket.status === "revealed" ? "猛暑前線" : revealedDestination?.name ?? `${index + 1}枚目の切符`}
				>
					{ticket.status === "hidden" ? <><TicketIcon aria-hidden="true"/><span>逃</span><small>{index + 1}</small></>
						: ticket.kind === "heat" ? <><Flame aria-hidden="true"/><strong>猛暑前線</strong><small>逃走範囲が縮小</small></>
						: ticket.status === "burned" ? <><Flame aria-hidden="true"/><strong>消失</strong><small>猛暑に飲まれた</small></>
						: <><small>{ticket.ticketClass === "unknown" ? "未知の切符" : "本命切符"}</small><strong>{revealedDestination?.name ?? "逃げ先"}</strong><span>{Math.round(ticket.distanceKm)}km</span></>}
				</button>;
			})}
		</div>

		{game.phase === "ready" && <p className="ticket-instruction">好きな裏向き切符を1枚選ぶ</p>}
		{game.phase === "decision" && destination && <div className="ticket-decision" data-testid="ticket-decision">
			<div className="revealed-summary"><small>引いた逃げ先</small><strong>{destination.name}</strong><span>{destination.hint}</span><div><b>冷却根拠を確認済み</b><b>約{Math.round(destination.distanceKm)}km</b></div></div>
			<div className="ticket-actions">
				<button type="button" className="escape-now" onClick={onEscape} data-testid="escape-with-ticket"><ArrowRight aria-hidden="true"/>この切符で逃げる</button>
				<button type="button" className="discard-ticket" onClick={onDiscard} disabled={game.drawsUsed >= MAX_DRAWS} data-testid="discard-ticket"><RotateCcw aria-hidden="true"/>{game.drawsUsed >= MAX_DRAWS ? "最後の切符です" : "切符を捨てて、もう1枚引く"}</button>
			</div>
		</div>}
	</section>;
}
