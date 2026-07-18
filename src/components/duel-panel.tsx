"use client";

import { useEffect, useState } from "react";

export type DuelChoice = { id: string; label: string; symbol?: string; note?: string; remainingCount?: number };
export type DuelQuestion = { id: string; prompt: string; choices: [DuelChoice, DuelChoice] };
type Props = { question: DuelQuestion; step: number; total?: number; candidateCount: number; disabled?: boolean; onChoose: (questionId: string, choiceId: string) => void };

export const DEFAULT_DUELS: DuelQuestion[] = [
	{ id: "coolness", prompt: "どっちの涼しさ？", choices: [{ id: "water", label: "水辺", symbol: "◌", note: "川音と風" }, { id: "forest", label: "木陰", symbol: "♧", note: "森と霧" }] },
	{ id: "pace", prompt: "今日は？", choices: [{ id: "rest", label: "のんびり", symbol: "〜", note: "ほぼ歩かない" }, { id: "walk", label: "少し歩く", symbol: "↗", note: "景色を探す" }] },
	{ id: "discovery", prompt: "見つけたいのは？", choices: [{ id: "classic", label: "安心", symbol: "○", note: "間違いない場所" }, { id: "unknown", label: "知らない場所", symbol: "✦", note: "意外な一島" }] },
];

export function DuelPanel({ question, step, total = 3, candidateCount, disabled = false, onChoose }: Props) {
	const [chosen, setChosen] = useState<string | null>(null);
	useEffect(() => { const timer = window.setTimeout(() => setChosen(null), 0); return () => window.clearTimeout(timer); }, [question.id]);
	const choose = (id: string) => { if (disabled || chosen) return; setChosen(id); window.setTimeout(() => onChoose(question.id, id), 260); };
	return <section className={`duel-panel ${chosen ? "has-choice" : ""}`} aria-label="好みを選ぶ">
		<div className="duel-meta"><span data-testid="duel-step">{Math.min(step, total)} / {Math.min(total, 3)}</span><span data-testid="candidate-count">{candidateCount}の島</span></div>
		<h2 data-testid="duel-question">{question.prompt}</h2>
		<div className="duel-choices">{question.choices.map((choice, index) => <button key={choice.id} type="button" data-testid="duel-choice" data-choice={choice.id} className={chosen === choice.id ? "is-chosen" : chosen ? "is-passed" : ""} disabled={disabled || Boolean(chosen)} onClick={() => choose(choice.id)}><span className="duel-symbol" aria-hidden="true">{choice.symbol ?? (index ? "✦" : "○")}</span><strong>{choice.label}</strong>{choice.note && <small>{choice.note}</small>}{choice.remainingCount != null && <em>{choice.remainingCount}地点が浮上</em>}</button>)}</div>
		<div className="duel-reaction" aria-hidden="true"><i/><i/><i/></div>
	</section>;
}
