"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ExternalLink, LocateFixed, MapPin, Navigation, X } from "lucide-react";
import { origins } from "@/data/origins";
import { TicketGamePanel } from "./ticket-game-panel";
import { createTicketGame, discardCurrentTicket, drawTicket, escapeWithCurrentTicket, type TicketGameState } from "@/lib/ticket-game";

const JapanMap = dynamic(() => import("./interactive-japan-map").then((module) => module.InteractiveJapanMap), {
	ssr: false,
	loading: () => <div className="map-loading" role="status"><span>逃走フィールドを描いています</span></div>,
});

type ExploreStatus = "idle" | "loading" | "playing" | "done" | "error";
type LocationStatus = "idle" | "locating" | "found" | "unavailable";
type GeoOrigin = { latitude: number; longitude: number };

export type Destination = {
	id: string;
	name: string;
	hint: string;
	latitude: number;
	longitude: number;
	reachable: boolean;
	officialUrl: string | null;
	station: string | null;
	reason: string | null;
	accessSummary: string | null;
	seasonalNotes: string[];
	distanceKm: number;
	score: number;
};

type ExploreResult = {
	catalogSize: number;
	candidatePoolCount: number;
	mapItems: Destination[];
	ticketCandidates: Destination[];
};

const ORIGINS = origins.map((origin) => ({ id: origin.id, label: origin.name }));
const LOCATION_SESSION_KEY = "summer-escape:origin:v1";
const CATEGORY_LABELS: Record<string, string> = { water: "水辺", forest: "森と木陰", highland: "高原", coast: "海風", indoor: "屋内", night: "夕涼み" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; };

function coarseOrigin(position: GeolocationPosition): GeoOrigin {
	return { latitude: Number(position.coords.latitude.toFixed(2)), longitude: Number(position.coords.longitude.toFixed(2)) };
}

function rememberOrigin(origin: GeoOrigin | null) {
	try { window.sessionStorage.setItem(LOCATION_SESSION_KEY, JSON.stringify(origin ? { mode: "geo", ...origin } : { mode: "fallback" })); } catch { /* tab storage may be unavailable */ }
}

function parseDestination(value: unknown, index: number): Destination | null {
	const item = record(value);
	const latitude = number(item.lat ?? item.latitude);
	const longitude = number(item.lon ?? item.longitude);
	const name = text(item.name);
	if (!name || latitude === null || longitude === null) return null;
	const categories = Array.isArray(item.categories) ? item.categories.filter((entry): entry is string => typeof entry === "string") : [];
	const reasons = Array.isArray(item.reasons) ? item.reasons.filter((entry): entry is string => typeof entry === "string") : [];
	return {
		id: text(item.id) ?? `destination-${index}`,
		name,
		hint: text(item.mysteryHint) ?? CATEGORY_LABELS[categories[0]] ?? "涼しい場所",
		latitude,
		longitude,
		reachable: true,
		officialUrl: text(item.officialUrl),
		station: text(item.station),
		reason: reasons[0] ?? null,
		accessSummary: text(item.accessSummary),
		seasonalNotes: Array.isArray(item.seasonalNotes) ? item.seasonalNotes.filter((entry): entry is string => typeof entry === "string").slice(0, 2) : [],
		distanceKm: number(item.distanceKm) ?? 0,
		score: number(item.score) ?? 0,
	};
}

function parseExplore(value: unknown): ExploreResult {
	const root = record(value);
	if (root.ok === false) throw new Error(text(record(root.error).message) ?? "候補を確認できません");
	const ticketCandidates = (Array.isArray(root.ticketCandidates) ? root.ticketCandidates : []).map(parseDestination).filter((item): item is Destination => item !== null);
	const finalById = new Map(ticketCandidates.map((item) => [item.id, item]));
	const mapItems = (Array.isArray(root.mapCandidates) ? root.mapCandidates : []).flatMap((value, index): Destination[] => {
		const item = record(value);
		const id = text(item.id);
		const latitude = number(item.lat);
		const longitude = number(item.lon);
		if (!id || latitude === null || longitude === null) return [];
		const known = finalById.get(id);
		if (known) return [{ ...known, reachable: item.active === true }];
		return [{ id, name: `秘密の島 ${index + 1}`, hint: "まだ見えない逃げ先", latitude, longitude, reachable: item.active === true, officialUrl: null, station: null, reason: null, accessSummary: null, seasonalNotes: [], distanceKm: number(item.distanceKm) ?? 0, score: 0 }];
	});
	return { catalogSize: number(root.catalogSize) ?? 0, candidatePoolCount: number(root.candidatePoolCount) ?? 0, mapItems, ticketCandidates };
}

function googleMapsDirectionsUrl(destination: Destination, origin?: GeoOrigin) {
	const query = new URLSearchParams({ api: "1", destination: `${destination.latitude},${destination.longitude}`, travelmode: "transit" });
	if (origin) query.set("origin", `${origin.latitude},${origin.longitude}`);
	return `https://www.google.com/maps/dir/?${query.toString()}`;
}

export function SummerEscape() {
	const [originId, setOriginId] = useState("tokyo");
	const [geoOrigin, setGeoOrigin] = useState<GeoOrigin | null>(null);
	const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
	const [mapItems, setMapItems] = useState<Destination[]>([]);
	const [destinations, setDestinations] = useState<Destination[]>([]);
	const [catalogSize, setCatalogSize] = useState(0);
	const [candidatePoolCount, setCandidatePoolCount] = useState(0);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [ticketGame, setTicketGame] = useState<TicketGameState | null>(null);
	const [status, setStatus] = useState<ExploreStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const explorationSeed = useRef("");
	const selected = destinations.find((item) => item.id === selectedId) ?? null;

	useEffect(() => {
		let cancelled = false;
		try {
			const saved = record(JSON.parse(window.sessionStorage.getItem(LOCATION_SESSION_KEY) ?? "null"));
			const latitude = number(saved.latitude); const longitude = number(saved.longitude);
			void Promise.resolve().then(() => {
				if (cancelled) return;
				if (saved.mode === "fallback") setLocationStatus("unavailable");
				if (saved.mode === "geo" && latitude !== null && longitude !== null) { setGeoOrigin({ latitude, longitude }); setOriginId("current"); setLocationStatus("found"); }
			});
		} catch { /* ignore invalid tab state */ }
		return () => { cancelled = true; };
	}, []);

	const requestCurrentLocation = useCallback(() => {
		if (!("geolocation" in navigator)) { setLocationStatus("unavailable"); return; }
		setLocationStatus("locating");
		navigator.geolocation.getCurrentPosition((position) => {
			const located = coarseOrigin(position); setGeoOrigin(located); setOriginId("current"); setLocationStatus("found"); rememberOrigin(located);
		}, () => { setLocationStatus("unavailable"); rememberOrigin(null); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 });
	}, []);

	const requestExplore = useCallback(async (overrideOrigin?: GeoOrigin) => {
		setStatus("loading"); setError(null); setSelectedId(null); setTicketGame(null);
		const current = overrideOrigin ?? geoOrigin;
		const origin = current ? { origin: { name: "現在地", lat: current.latitude, lon: current.longitude } } : { originId };
		explorationSeed.current = new URLSearchParams(window.location.search).get("seed")?.trim() || crypto.randomUUID();
		try {
			const response = await fetch("/api/explore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...origin, seed: explorationSeed.current }) });
			const parsed = parseExplore(await response.json().catch(() => null));
			if (!response.ok) throw new Error("候補を確認できません");
			if (parsed.ticketCandidates.length < 5) { setMapItems([]); setDestinations([]); setStatus("done"); return; }
			setMapItems(parsed.mapItems); setDestinations(parsed.ticketCandidates); setCatalogSize(parsed.catalogSize); setCandidatePoolCount(parsed.candidatePoolCount);
			setTicketGame(createTicketGame(parsed.ticketCandidates, explorationSeed.current)); setStatus("playing");
		} catch (cause) { setMapItems([]); setDestinations([]); setStatus("error"); setError(cause instanceof Error ? `${cause.message}。` : "候補を確認できません。"); }
	}, [geoOrigin, originId]);

	const startTicketGame = () => {
		if (geoOrigin || locationStatus === "unavailable" || !("geolocation" in navigator)) { void requestExplore(); return; }
		setLocationStatus("locating");
		navigator.geolocation.getCurrentPosition((position) => { const located = coarseOrigin(position); setGeoOrigin(located); setOriginId("current"); setLocationStatus("found"); rememberOrigin(located); void requestExplore(located); }, () => { setLocationStatus("unavailable"); rememberOrigin(null); void requestExplore(); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 });
	};
	const confirmEscapeTicket = () => { if (!ticketGame) return; const next = escapeWithCurrentTicket(ticketGame); if (!next.escapedCandidateId) return; setTicketGame(next); setStatus("done"); setSelectedId(next.escapedCandidateId); };
	const directionsOrigin = geoOrigin ?? origins.find((origin) => origin.id === originId);
	const visibleItems = useMemo(() => {
		if (!ticketGame) return mapItems.length ? mapItems : destinations;
		const ticketByCandidate = new Map(ticketGame.tickets.flatMap((ticket) => ticket.kind === "destination" ? [[ticket.candidateId, ticket] as const] : []));
		return destinations.flatMap((item) => { const ticket = ticketByCandidate.get(item.id); if (!ticket || ticket.status === "burned" || ticket.status === "discarded") return []; return [{ ...item, name: ticket.status === "hidden" ? "？？？" : item.name, hint: ticket.status === "hidden" ? "まだ見えない逃げ先" : item.hint }]; });
	}, [mapItems, destinations, ticketGame]);

	return <main className={`escape-shell ${status === "done" && destinations.length ? "has-results" : ""}`}>
		<header className="topbar"><h1 data-testid="app-title">夏の抜け道</h1><div className="quick-controls" aria-label="出発地"><button className="location-button" type="button" aria-label="現在地を使う" aria-pressed={originId === "current"} onClick={requestCurrentLocation} data-testid="use-current-location-primary"><LocateFixed/></button><label className="select-control"><MapPin/><span className="sr-only">出発地</span><select data-testid="departure-select" value={originId} onChange={(event) => { setOriginId(event.target.value); if (event.target.value !== "current") setGeoOrigin(null); }}>{geoOrigin && <option value="current">現在地から</option>}{ORIGINS.map((origin) => <option key={origin.id} value={origin.id}>{origin.label}から</option>)}</select><ChevronDown/></label></div><span className={`location-status ${locationStatus}`} data-testid="location-status" aria-live="polite">{locationStatus === "locating" ? "現在地を確認中" : locationStatus === "found" ? "現在地から探します" : locationStatus === "unavailable" ? "駅から始めます" : ""}</span></header>
		<section className={`map-stage ${ticketGame?.heatHits ? "heat-is-closing" : ""}`} aria-label="逃走フィールド"><JapanMap destinations={visibleItems} selectedId={selectedId} originId={originId} origin={geoOrigin ?? undefined} loading={status === "loading"} locationStatus={locationStatus} onUseCurrentLocation={requestCurrentLocation} onSelect={(id) => { if (destinations.some((item) => item.id === id)) setSelectedId(id); }}/><div className={`result-status ${status}`} aria-live="polite">{status === "loading" && <>逃げ先を探しています</>}{status === "error" && <span data-testid="search-error">{error}</span>}{status === "playing" && <span title={`${catalogSize.toLocaleString("ja-JP")}地点から${candidatePoolCount}候補を確認`}>{ticketGame?.message}</span>}{status === "done" && destinations.length > 0 && <span>逃げ先を確保しました</span>}</div></section>
		{ticketGame && status !== "loading" && !selected && <TicketGamePanel game={ticketGame} destinations={destinations} onDraw={(id) => setTicketGame((current) => current ? drawTicket(current, id) : current)} onDiscard={() => setTicketGame((current) => current ? discardCurrentTicket(current) : current)} onEscape={confirmEscapeTicket}/>}
		{status === "done" && destinations.length === 0 && <div className="landing-prompt needs-route empty-result" data-testid="empty-result"><div><span>近くに切符を作れる場所がありませんでした</span><strong>出発地を変えてみてください</strong></div></div>}
		<footer className="time-dock explore-dock" aria-label="ゲーム開始"><button data-testid="search-button" className="choose-button" type="button" disabled={status === "loading" || locationStatus === "locating"} onClick={startTicketGame}>{status === "loading" || locationStatus === "locating" ? "現在地を確認中" : status === "idle" || status === "error" ? "現在地から逃げる" : "もう一度逃げる"}<ArrowUpRight/></button></footer>
		{selected && <DestinationSheet destination={selected} origin={directionsOrigin} onClose={() => setSelectedId(null)}/>}
	</main>;
}

function DestinationSheet({ destination, origin, onClose }: { destination: Destination; origin?: GeoOrigin; onClose: () => void }) {
	return <aside className="detail-sheet" data-testid="destination-detail" tabIndex={-1} aria-label={`${destination.name}の詳細`}><button className="close-sheet" type="button" onClick={onClose} aria-label="詳細を閉じる"><X/></button><div className="detail-kicker">{destination.hint}</div><h2>{destination.name}</h2><div className="detail-facts"><strong>約{Math.round(destination.distanceKm)}km</strong>{destination.station && <span><Navigation/>{destination.station}</span>}</div><details className="temperature-note"><summary>この切符の選び方</summary><p>公式確認済みの冷却根拠、現在地からの距離、アクセスをもとに選んでいます。出発前に最新の天気と運行情報を確認してください。</p></details>{destination.reason && <p>{destination.reason}</p>}{destination.accessSummary && <div className="verified-access"><Navigation/><span><strong>行き方</strong>{destination.accessSummary}</span></div>}{destination.seasonalNotes.length > 0 && <p className="seasonal-note">確認：{destination.seasonalNotes.join(" / ")}</p>}<div className="detail-actions"><a className="route-fallback" data-testid="google-maps-directions" href={googleMapsDirectionsUrl(destination, origin)} target="_blank" rel="noreferrer">Google Mapsで行き方を見る<ExternalLink/></a>{destination.officialUrl && <a className="official-link" href={destination.officialUrl} target="_blank" rel="noreferrer">公式情報を見る<ExternalLink/></a>}</div></aside>;
}
