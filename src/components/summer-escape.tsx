"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Clock3, ExternalLink, LocateFixed, MapPin, Navigation, Plane, Route, X } from "lucide-react";
import { dateForJapan, formatJapanDate, timeInJapan } from "@/lib/time";
import { origins } from "@/data/origins";
import type { TemperaturePoint } from "./interactive-japan-map";
import { TicketGamePanel } from "./ticket-game-panel";
import { createTicketGame, discardCurrentTicket, drawTicket, escapeWithCurrentTicket, type TicketGameState } from "@/lib/ticket-game";

const JapanTideMap = dynamic(
	() => import("./interactive-japan-map").then((module) => module.InteractiveJapanMap),
	{
		ssr: false,
		loading: () => <div className="map-loading" role="status"><span>日本の涼しさを描いています</span></div>,
	},
);

type DayChoice = "today" | "tomorrow" | "weekend";
type ExploreStatus = "idle" | "loading" | "playing" | "done" | "error";
type LocationStatus = "idle" | "locating" | "found" | "unavailable";
type RouteStatus = "unknown" | "checking" | "available" | "unavailable";
type RouteReason = "no_outbound" | "no_inbound" | "insufficient_stay" | "provider_error" | "access_unverified";
type TemperatureStatus = "loading" | "ready" | "unavailable";
type WeatherValueMode = "direct-forecast" | "interpolated-forecast" | "terrain-estimate";
type GeoOrigin = { latitude: number; longitude: number };
type WeatherSnapshotMeta = { date: string; fetchedAt: string; expiresAt: string; stale: boolean; mode: "forecast" | "terrain-estimate"; sampleCount: number };
type TemperatureMapResponse = { points: TemperaturePoint[]; cellCount: number; forecastSampleCount: number; weatherSnapshot: WeatherSnapshotMeta | null };

export type Destination = {
	id: string;
	name: string;
	hint: string;
	latitude: number;
	longitude: number;
	temperature: number | null;
	airTemperature: number | null;
	weatherValueMode: WeatherValueMode;
	durationMinutes: number | null;
	reachable: boolean;
	routeStatus: RouteStatus;
	routeReason: RouteReason | null;
	routeAvailable: boolean;
	routeSummary: string | null;
	departAt: string | null;
	arriveAt: string | null;
	returnAt: string | null;
	usesAir: boolean;
	officialUrl: string | null;
	station: string | null;
	reason: string | null;
	accessSummary: string | null;
	seasonalNotes: string[];
	distanceKm: number;
	score: number;
};

type ExploreResult = {
	remainingCount: number;
	catalogSize: number;
	candidatePoolCount: number;
	eligibleCount: number;
	mapItems: Destination[];
	ticketCandidates: Destination[];
	weatherSnapshot: WeatherSnapshotMeta | null;
};

const ORIGINS = origins.map((origin) => ({ id: origin.id, label: origin.name }));
const LOCATION_SESSION_KEY = "summer-escape:origin:v1";
const DAYS: { id: DayChoice; label: string }[] = [
	{ id: "today", label: "今日" },
	{ id: "tomorrow", label: "明日" },
	{ id: "weekend", label: "週末" },
];
const CATEGORY_LABELS: Record<string, string> = {
	water: "水辺",
	forest: "森と木陰",
	highland: "高原",
	coast: "海風",
	indoor: "屋内",
	night: "夕涼み",
};
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : null;
};
const first = (source: Record<string, unknown>, keys: string[]) => {
	for (const key of keys) if (source[key] != null) return source[key];
	return null;
};

function coarseOrigin(position: GeolocationPosition): GeoOrigin {
	return {
		latitude: Number(position.coords.latitude.toFixed(2)),
		longitude: Number(position.coords.longitude.toFixed(2)),
	};
}

function rememberOrigin(origin: GeoOrigin | null) {
	try {
		window.sessionStorage.setItem(LOCATION_SESSION_KEY, JSON.stringify(origin ? { mode: "geo", ...origin } : { mode: "fallback" }));
	} catch { /* Some private browsing modes disable session storage. */ }
}

function parseWeatherSnapshot(value: unknown): WeatherSnapshotMeta | null {
	const snapshot = record(value);
	const date = text(snapshot.date);
	const fetchedAt = text(snapshot.fetchedAt);
	const expiresAt = text(snapshot.expiresAt);
	const sampleCount = number(snapshot.sampleCount);
	const mode = snapshot.mode === "terrain-estimate" ? "terrain-estimate" : snapshot.mode === "forecast" ? "forecast" : null;
	if (!date || !fetchedAt || !expiresAt || !mode || sampleCount === null) return null;
	return { date, fetchedAt, expiresAt, stale: snapshot.stale === true, mode, sampleCount };
}

function parseTemperatureMap(value: unknown): TemperatureMapResponse | null {
	const root = record(value);
	if (root.ok !== true || !Array.isArray(root.points)) return null;
	const grid = record(root.grid);
	const weatherSnapshot = parseWeatherSnapshot(root.snapshot);
	const points = root.points.flatMap((value, index): TemperaturePoint[] => {
		if (Array.isArray(value)) {
			const lat = number(value[0]); const lon = number(value[1]); const temperatureC = number(value[2]);
			return lat !== null && lon !== null && (temperatureC !== null || weatherSnapshot?.mode === "terrain-estimate") ? [{ id: `temperature-${index}`, lat, lon, temperatureC }] : [];
		}
		const point = record(value); const id = text(point.id); const lat = number(point.lat); const lon = number(point.lon); const temperatureC = number(point.temperatureC);
		return id && lat !== null && lon !== null && (temperatureC !== null || weatherSnapshot?.mode === "terrain-estimate") ? [{ id, lat, lon, temperatureC }] : [];
	});
	return { points, cellCount: number(grid.cellCount) ?? points.length, forecastSampleCount: number(grid.forecastSampleCount) ?? 0, weatherSnapshot };
}

function weatherMapCacheKey(date: string) {
	return `summer-escape:weather-map:v1:${date}`;
}

function readCachedWeatherMap(date: string): TemperatureMapResponse | null {
	try {
		const cached = parseTemperatureMap(JSON.parse(window.localStorage.getItem(weatherMapCacheKey(date)) ?? "null"));
		if (!cached?.weatherSnapshot) return null;
		const expiresAt = Date.parse(cached.weatherSnapshot.expiresAt);
		// Showing the last successful map while it refreshes is better than an
		// empty orange screen. The server marks the same grace period as stale.
		if (!Number.isFinite(expiresAt) || expiresAt + 24 * 60 * 60 * 1000 <= Date.now()) return null;
		return {
			...cached,
			weatherSnapshot: { ...cached.weatherSnapshot, stale: expiresAt <= Date.now() },
		};
	} catch {
		return null;
	}
}

function parseRecommendation(value: unknown, index: number): Destination | null {
	const item = record(value);
	const route = record(first(item, ["route", "transit"]));
	const outbound = record(route.outbound);
	const inbound = record(first(route, ["return", "inbound"]));
	const latitude = number(first(item, ["lat", "latitude"]));
	const longitude = number(first(item, ["lon", "longitude", "lng"]));
	const name = text(item.name);
	if (!name || latitude === null || longitude === null) return null;
	const categories = Array.isArray(item.categories) ? item.categories.filter((entry): entry is string => typeof entry === "string") : [];
	const reasons = Array.isArray(item.reasons) ? item.reasons.filter((entry): entry is string => typeof entry === "string") : [];
	const routeStatus = text(route.status);
	const duration = number(outbound.durationMinutes) ?? number(route.roundTripMinutes);
	return {
		id: text(item.id) ?? "destination-" + index,
		name,
		hint: text(item.mysteryHint) ?? CATEGORY_LABELS[categories[0]] ?? "涼しい場所",
		latitude,
		longitude,
		// Every visible temperature in the discovery flow is labelled as
		// "体感". Prefer the apparent temperature so the card, map label and
		// comparison reason cannot disagree with each other.
		temperature: number(item.apparentTemperatureC) ?? number(item.temperatureC),
		airTemperature: number(item.temperatureC),
		weatherValueMode: item.weatherValueMode === "direct-forecast" ? "direct-forecast" : item.weatherValueMode === "terrain-estimate" ? "terrain-estimate" : "interpolated-forecast",
		durationMinutes: duration,
		reachable: true,
		routeStatus: routeStatus === "available" ? "available" : routeStatus === "unavailable" ? "unavailable" : routeStatus === "checking" ? "checking" : "unknown",
		routeReason: text(route.reason) as RouteReason | null,
		routeAvailable: routeStatus === "available",
		routeSummary: null,
		departAt: text(outbound.departure),
		arriveAt: text(outbound.arrival),
		returnAt: text(inbound.arrival),
		usesAir: route.usesAir === true || outbound.usesAir === true || inbound.usesAir === true,
		officialUrl: text(first(item, ["officialUrl", "tourismUrl"])),
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
	if (root.ok === false) {
		const error = record(root.error);
		throw new Error(text(error.message) ?? "最新の情報を確認できません");
	}
	const rawTicketCandidates = Array.isArray(root.ticketCandidates) ? root.ticketCandidates : [];
	const ticketCandidates = rawTicketCandidates.map(parseRecommendation).filter((item): item is Destination => item !== null);
	const finalById = new Map(ticketCandidates.map((item) => [item.id, item]));
	const rawMap = Array.isArray(root.mapCandidates) ? root.mapCandidates : [];
	const mapItems = rawMap.flatMap((value, index): Destination[] => {
		const item = record(value);
		const id = text(item.id);
		const latitude = number(first(item, ["lat", "latitude"]));
		const longitude = number(first(item, ["lon", "longitude"]));
		if (!id || latitude === null || longitude === null) return [];
		const known = finalById.get(id);
		if (known) return [{ ...known, reachable: item.active === true }];
		const categories = Array.isArray(item.categories) ? item.categories.filter((entry): entry is string => typeof entry === "string") : [];
		return [{
			id,
			name: "秘密の島 " + (index + 1),
			hint: CATEGORY_LABELS[categories[0]] ?? "まだ知らない涼しさ",
			latitude,
			longitude,
				temperature: item.weatherValueMode === "terrain-estimate" ? null : number(item.temperatureC),
			airTemperature: null,
			weatherValueMode: item.weatherValueMode === "direct-forecast" ? "direct-forecast" : item.weatherValueMode === "terrain-estimate" ? "terrain-estimate" : "interpolated-forecast",
			durationMinutes: null,
			reachable: item.active === true,
			routeStatus: "unknown",
			routeReason: null,
			routeAvailable: false,
			routeSummary: null,
			departAt: null,
			arriveAt: null,
			returnAt: null,
			usesAir: false,
			officialUrl: null,
			station: null,
			reason: "選択すると輪郭がはっきりします",
			accessSummary: null,
			seasonalNotes: [],
			distanceKm: number(item.distanceKm) ?? 0,
			score: 0,
		}];
	});
	return {
		remainingCount: number(root.remainingCount) ?? ticketCandidates.length,
		catalogSize: number(root.catalogSize) ?? 0,
		candidatePoolCount: number(root.candidatePoolCount) ?? 0,
		eligibleCount: number(root.eligibleCount) ?? 0,
		mapItems: mapItems.length ? mapItems : ticketCandidates,
		ticketCandidates,
		weatherSnapshot: parseWeatherSnapshot(root.weatherSnapshot),
	};
}

function applyRoute(destination: Destination, value: unknown): Destination {
	const item = record(value);
	const route = record(item.route);
	const outbound = record(route.outbound);
	const inbound = record(first(route, ["return", "inbound"]));
	const status = text(route.status);
	const routeStatus: RouteStatus = status === "available" ? "available" : "unavailable";
	return {
		...destination,
		routeStatus,
		routeReason: text(route.reason) as RouteReason | null,
		routeAvailable: routeStatus === "available",
		durationMinutes: number(outbound.durationMinutes) ?? number(route.roundTripMinutes),
		departAt: text(outbound.departure),
		arriveAt: text(outbound.arrival),
		returnAt: text(inbound.arrival),
		usesAir: route.usesAir === true || outbound.usesAir === true || inbound.usesAir === true,
	};
}

function suggestedTodayDeparture() {
	const now = timeInJapan(new Date(Date.now() + 2 * 60 * 60 * 1000));
	const rounded = Math.ceil((now.hours * 60 + now.minutes) / 30) * 30;
	const total = Math.min(20 * 60, rounded);
	return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}
function addJapanCalendarDays(date: string, days: number) {
	const value = new Date(`${date}T12:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}
function durationLabel(minutes: number | null) {
	if (minutes === null) return null;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours ? hours + "時間" + (rest ? rest + "分" : "") : rest + "分";
}
function googleMapsDirectionsUrl(destination: Destination, origin?: GeoOrigin) {
	const query = new URLSearchParams({
		api: "1",
		destination: `${destination.latitude},${destination.longitude}`,
		travelmode: "transit",
	});
	if (origin) query.set("origin", `${origin.latitude},${origin.longitude}`);
	return `https://www.google.com/maps/dir/?${query.toString()}`;
}
function displayTimestamp(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function SummerEscape() {
	const [originId, setOriginId] = useState("tokyo");
	const [geoOrigin, setGeoOrigin] = useState<GeoOrigin | null>(null);
	const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
	const [date, setDate] = useState(() => dateForJapan("weekend"));
	const [depart, setDepart] = useState("07:00");
	const [returnAt, setReturnAt] = useState("22:00");
	const [temperatureLimit, setTemperatureLimit] = useState(28);
	const [temperaturePoints, setTemperaturePoints] = useState<TemperaturePoint[]>([]);
	const [forecastSampleCount, setForecastSampleCount] = useState(0);
	const [weatherCellCount, setWeatherCellCount] = useState(0);
	const [temperatureStatus, setTemperatureStatus] = useState<TemperatureStatus>("loading");
	const [mapItems, setMapItems] = useState<Destination[]>([]);
	const [recommendations, setRecommendations] = useState<Destination[]>([]);
	const [catalogSize, setCatalogSize] = useState(0);
	const [candidatePoolCount, setCandidatePoolCount] = useState(0);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [ticketGame, setTicketGame] = useState<TicketGameState | null>(null);
	const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshotMeta | null>(null);
	const [status, setStatus] = useState<ExploreStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const explorationSeed = useRef("");
	const selected = recommendations.find((item) => item.id === selectedId) ?? null;

	useEffect(() => {
		let cancelled = false;
		try {
			const saved = record(JSON.parse(window.sessionStorage.getItem(LOCATION_SESSION_KEY) ?? "null"));
			const latitude = number(saved.latitude);
			const longitude = number(saved.longitude);
			void Promise.resolve().then(() => {
				if (cancelled) return;
				if (saved.mode === "fallback") {
					setLocationStatus("unavailable");
					return;
				}
				if (saved.mode === "geo" && latitude !== null && longitude !== null) {
					setGeoOrigin({ latitude, longitude });
					setOriginId("current");
					setLocationStatus("found");
				}
			});
		} catch { /* Ignore invalid tab-scoped state. */ }
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		const cached = readCachedWeatherMap(date);
		void Promise.resolve().then(() => {
			if (controller.signal.aborted) return;
			startTransition(() => {
				if (cached) {
					setTemperaturePoints(cached.points);
					setForecastSampleCount(cached.forecastSampleCount);
					setWeatherCellCount(cached.cellCount);
					setWeatherSnapshot(cached.weatherSnapshot);
					setTemperatureStatus("ready");
				} else {
					setTemperaturePoints([]);
					setForecastSampleCount(0);
					setWeatherCellCount(0);
					setWeatherSnapshot(null);
					setTemperatureStatus("loading");
				}
			});
		});
		void fetch(`/api/temperature-map?date=${encodeURIComponent(date)}`, { signal: controller.signal, headers: { accept: "application/json" } })
			.then((response) => response.json())
			.then((body: unknown) => {
				const parsed = parseTemperatureMap(body);
				if (!parsed) { if (!cached) setTemperatureStatus("unavailable"); return; }
				try { window.localStorage.setItem(weatherMapCacheKey(date), JSON.stringify(body)); } catch { /* Private browsing can disable storage. */ }
				startTransition(() => {
					setTemperaturePoints(parsed.points);
				setForecastSampleCount(parsed.forecastSampleCount);
				setWeatherCellCount(parsed.cellCount);
					setWeatherSnapshot(parsed.weatherSnapshot);
					setTemperatureStatus("ready");
				});
			}).catch(() => { if (!controller.signal.aborted && !cached) setTemperatureStatus("unavailable"); });
		return () => controller.abort();
	}, [date]);

	const requestCurrentLocation = useCallback(() => {
		if (!("geolocation" in navigator)) { setLocationStatus("unavailable"); return; }
		setLocationStatus("locating");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const located = coarseOrigin(position);
				setGeoOrigin(located);
				setOriginId("current");
				setLocationStatus("found");
				rememberOrigin(located);
			},
			() => { setLocationStatus("unavailable"); rememberOrigin(null); },
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
		);
	}, []);

	const requestExplore = useCallback(async (overrides?: { depart?: string; returnAt?: string; temperatureLimit?: number; origin?: GeoOrigin }) => {
		const effectiveDepart = overrides?.depart ?? depart;
		const effectiveReturn = overrides?.returnAt ?? returnAt;
		const effectiveTemperatureLimit = overrides?.temperatureLimit ?? temperatureLimit;
		setStatus("loading");
		setError(null);
		setSelectedId(null);
		setTicketGame(null);
		const effectiveGeoOrigin = overrides?.origin ?? geoOrigin;
		const origin = effectiveGeoOrigin
			? { origin: { name: "現在地", lat: effectiveGeoOrigin.latitude, lon: effectiveGeoOrigin.longitude } }
			: { originId };
		// A fixed seed in the URL makes demos and browser QA reproducible without
		// changing the normal experience, which still gets a fresh deck each run.
		const requestedSeed = new URLSearchParams(window.location.search).get("seed")?.trim();
		explorationSeed.current = requestedSeed || crypto.randomUUID();
		try {
			const response = await fetch("/api/explore", {
					method: "POST",
					headers: { "content-type": "application/json", accept: "application/json" },
					body: JSON.stringify({ ...origin, date, depart: effectiveDepart, return: effectiveReturn, maxApparentTemperature: effectiveTemperatureLimit, seed: explorationSeed.current }),
			});
			const parsed = parseExplore(await response.json().catch(() => null));
			if (!response.ok) throw new Error("最新の情報を確認できません");
			if (parsed.ticketCandidates.length === 0) {
				setMapItems([]);
				setRecommendations([]);
				setCatalogSize(parsed.catalogSize);
				setCandidatePoolCount(parsed.candidatePoolCount);
				if (parsed.weatherSnapshot) setWeatherSnapshot(parsed.weatherSnapshot);
				setStatus("done");
				return;
			}
			if (parsed.ticketCandidates.length < 5) throw new Error("切符にできる逃げ先が足りません");
			const nextGame = createTicketGame(parsed.ticketCandidates, explorationSeed.current);
			setMapItems(parsed.ticketCandidates);
			setRecommendations(parsed.ticketCandidates);
			setTicketGame(nextGame);
			setCatalogSize(parsed.catalogSize);
			setCandidatePoolCount(parsed.candidatePoolCount);
			if (parsed.weatherSnapshot) setWeatherSnapshot(parsed.weatherSnapshot);
		setStatus("playing");
		} catch (reason) {
			setMapItems([]);
			setRecommendations([]);
			setTicketGame(null);
			setWeatherSnapshot(null);
			setStatus("error");
			const message = reason instanceof Error ? reason.message : "最新の情報を確認できません";
			setError(message.endsWith("。") ? message : message + "。");
		}
	}, [date, depart, geoOrigin, originId, returnAt, temperatureLimit]);

	const startExplore = () => requestExplore();
	const startTicketGame = () => {
		if (geoOrigin || locationStatus === "unavailable" || !("geolocation" in navigator)) { void startExplore(); return; }
		setLocationStatus("locating");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const located = coarseOrigin(position);
				setGeoOrigin(located);
				setOriginId("current");
				setLocationStatus("found");
				rememberOrigin(located);
				void requestExplore({ origin: located });
			},
			() => { setLocationStatus("unavailable"); rememberOrigin(null); void requestExplore(); },
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
		);
	};
	const drawEscapeTicket = (ticketId: string) => setTicketGame((current) => current ? drawTicket(current, ticketId) : current);
	const discardEscapeTicket = () => setTicketGame((current) => current ? discardCurrentTicket(current) : current);
	const confirmEscapeTicket = () => {
		if (!ticketGame) return;
		const next = escapeWithCurrentTicket(ticketGame);
		if (!next.escapedCandidateId) return;
		setTicketGame(next);
		setStatus("done");
		setSelectedId(next.escapedCandidateId);
		const origin = geoOrigin ? { origin: { name: "現在地", lat: geoOrigin.latitude, lon: geoOrigin.longitude } } : { originId };
		void fetch("/api/routes", {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({ ...origin, date, depart, return: returnAt, destinationIds: [next.escapedCandidateId], allowAir: false }),
		}).then(async (response) => {
			const body = record(await response.json().catch(() => null));
			if (!response.ok) throw new Error("route_lookup_failed");
			const routeItem = Array.isArray(body.routes) ? body.routes[0] : null;
			if (!routeItem) return;
			setRecommendations((items) => items.map((item) => item.id === next.escapedCandidateId ? applyRoute(item, routeItem) : item));
			setMapItems((items) => items.map((item) => item.id === next.escapedCandidateId ? applyRoute(item, routeItem) : item));
		}).catch(() => {
			setRecommendations((items) => items.map((item) => item.id === next.escapedCandidateId ? { ...item, routeStatus: "unavailable", routeReason: "provider_error" } : item));
		});
	};
	const mapOrigin = geoOrigin ?? undefined;
	const directionsOrigin = geoOrigin ?? origins.find((origin) => origin.id === originId);
	const visibleItems = useMemo(() => {
		if (!ticketGame) return mapItems.length ? mapItems : recommendations;
		const ticketByCandidate = new Map(ticketGame.tickets.flatMap((ticket) => ticket.kind === "destination" ? [[ticket.candidateId, ticket] as const] : []));
		return recommendations.flatMap((item) => {
			const ticket = ticketByCandidate.get(item.id);
			if (!ticket || ticket.status === "burned" || ticket.status === "discarded") return [];
			return [{ ...item, name: ticket.status === "hidden" ? "？？？" : item.name, hint: ticket.status === "hidden" ? "まだ見えない逃げ先" : item.hint }];
		});
	}, [mapItems, recommendations, ticketGame]);
	const selectableDays = DAYS.map((item) => ({ ...item, date: dateForJapan(item.id) }))
		.filter((item, index, items) => items.findIndex((candidate) => candidate.date === item.date) === index);
	const firstForecastDate = dateForJapan("today");
	const lastForecastDate = addJapanCalendarDays(firstForecastDate, 15);
	const widenTemperatureSearch = () => {
		const widened = Math.min(34, temperatureLimit + 2);
		setTemperatureLimit(widened);
		void requestExplore({ temperatureLimit: widened });
	};

	return <main className={`escape-shell ${status === "done" && recommendations.length > 0 ? "has-results" : ""}`}>
		<header className="topbar">
			<h1 data-testid="app-title">夏の抜け道</h1>
			<div className="quick-controls" aria-label="探索条件">
				<button className="location-button" type="button" title={locationStatus === "locating" ? "現在地を確認中" : "現在地を使う"} aria-label={locationStatus === "locating" ? "現在地を確認中" : "現在地を使う"} aria-pressed={originId === "current"} onClick={requestCurrentLocation} data-testid="use-current-location-primary"><LocateFixed aria-hidden="true"/></button>
				<label className="select-control"><MapPin aria-hidden="true"/><span className="sr-only">出発地</span><select data-testid="departure-select" value={originId} onChange={(event) => { const id = event.target.value; setOriginId(id); if (id !== "current") setGeoOrigin(null); }}>{geoOrigin && <option value="current">現在地から</option>}{ORIGINS.map((origin) => <option key={origin.id} value={origin.id}>{origin.label}から</option>)}</select><ChevronDown aria-hidden="true"/></label>
			</div>
			<span className={`location-status ${locationStatus}`} data-testid="location-status" aria-live="polite">{locationStatus === "locating" ? "現在地を確認中" : locationStatus === "found" ? "現在地から探します" : locationStatus === "unavailable" ? "位置情報の許可が必要です" : ""}</span>
		</header>

		<section className={`map-stage ${ticketGame?.heatHits ? "heat-is-closing" : ""}`} aria-label="現在地から逃げられる候補">
			<JapanTideMap key={geoOrigin ? `${geoOrigin.latitude.toFixed(4)},${geoOrigin.longitude.toFixed(4)}` : "preset"} destinations={visibleItems} temperaturePoints={temperaturePoints} weatherCellCount={weatherCellCount} forecastSampleCount={forecastSampleCount} temperatureSourceMode={weatherSnapshot?.mode ?? null} temperatureStale={weatherSnapshot?.stale ?? false} temperatureStatus={temperatureStatus} temperatureLimit={temperatureLimit} onTemperatureLimitChange={setTemperatureLimit} selectedId={selectedId} originId={originId} origin={mapOrigin} loading={status === "loading"} locationStatus={locationStatus} onUseCurrentLocation={requestCurrentLocation} onSelect={(id) => { if (recommendations.some((item) => item.id === id)) setSelectedId(id); }}/>
			<div className={"result-status " + status} aria-live="polite">
				{status === "loading" && <><span className="status-orb"/>日本を探しています</>}
				{status === "error" && <span data-testid="search-error">{error}</span>}
				{status === "playing" && <span title={`${catalogSize.toLocaleString("ja-JP")}地点から現在地周辺の${candidatePoolCount}候補を確認`}>{ticketGame?.message ?? "逃げ先の切符を準備しました"}</span>}
				{status === "done" && <span>逃げ先を確保しました</span>}
				{weatherSnapshot && status === "done" && <small data-testid="source-timestamp" title={`${weatherSnapshot.date} 対象 · ${displayTimestamp(weatherSnapshot.fetchedAt)} JST取得 · ${displayTimestamp(weatherSnapshot.expiresAt)} JSTまで有効`}>{weatherSnapshot.mode === "forecast" ? `${weatherSnapshot.date} 11〜17時の最高 · ${displayTimestamp(weatherSnapshot.fetchedAt)} JST取得${weatherSnapshot.stale ? "（前回値）" : ""}` : "予報未取得 · 緯度と標高だけの参考値"}</small>}
			</div>
		</section>

		{ticketGame && status !== "loading" && !selected && <TicketGamePanel game={ticketGame} destinations={recommendations} onDraw={drawEscapeTicket} onDiscard={discardEscapeTicket} onEscape={confirmEscapeTicket}/>} 
		{status === "done" && recommendations.length === 0 && <div className="landing-prompt needs-route empty-result" data-testid="empty-result">
			<div><span>{temperatureLimit}℃以下は見つかりませんでした</span><strong>{temperatureLimit < 34 ? "少しだけ範囲を広げますか？" : "日付か出発地を変えてみてください"}</strong></div>
			{temperatureLimit < 34 && <button type="button" onClick={widenTemperatureSearch}>{Math.min(34, temperatureLimit + 2)}℃まで広げる</button>}
		</div>}

		<footer className="time-dock explore-dock" aria-label="旅の条件">
			<details className="trip-settings">
				<summary aria-label={`${formatJapanDate(date)} JST、${depart}出発、${returnAt}帰宅。旅の条件を変更`}><span data-testid="date-summary">{formatJapanDate(date)} <small>JST</small></span><strong>{depart} → {returnAt}</strong></summary>
				<div className="trip-settings-panel">
					<div className="trip-date-editor"><div className="segment-control" aria-label="出発日">{selectableDays.map((item) => <button key={item.id} type="button" title={`${item.label} — ${formatJapanDate(item.date)} JST`} aria-label={`${item.label}、${formatJapanDate(item.date)} JST`} aria-pressed={date === item.date} onClick={() => { setDate(item.date); setDepart(item.id === "today" ? suggestedTodayDeparture() : "07:00"); }}>{item.label}</button>)}</div><label className="calendar-input"><span>日付</span><input aria-label="出発日を選ぶ" type="date" min={firstForecastDate} max={lastForecastDate} value={date} onChange={(event) => { setDate(event.target.value); setDepart(event.target.value === firstForecastDate ? suggestedTodayDeparture() : "07:00"); }}/></label></div>
					<div className="trip-time-editor">
					<label className="clock-input"><span>出発</span><input data-testid="depart-time" type="time" min="06:00" max="20:00" step="900" value={depart} onChange={(event) => setDepart(event.target.value)}/></label>
					<div className="time-arrow" aria-hidden="true">→</div>
					<label className="clock-input"><span>帰宅</span><input data-testid="return-time" type="time" min="10:00" max="23:59" step="900" value={returnAt} onChange={(event) => setReturnAt(event.target.value)}/></label>
					</div>
				</div>
			</details>
			<button data-testid="search-button" className="choose-button" type="button" disabled={status === "loading" || locationStatus === "locating"} onClick={startTicketGame}>{status === "loading" || locationStatus === "locating" ? "現在地を確認中" : status === "idle" || status === "error" ? "現在地から逃げる" : "もう一度逃げる"}<ArrowUpRight aria-hidden="true"/></button>
		</footer>

		{selected && <DestinationSheet destination={selected} origin={directionsOrigin} weatherMode={weatherSnapshot?.mode ?? null} onClose={() => setSelectedId(null)}/>} 
	</main>;
}

function DestinationSheet({ destination, origin, weatherMode, onClose }: { destination: Destination; origin?: GeoOrigin; weatherMode: WeatherSnapshotMeta["mode"] | null; onClose: () => void }) {
	const isTerrainEstimate = destination.weatherValueMode === "terrain-estimate" || weatherMode === "terrain-estimate";
	const isInterpolatedForecast = destination.weatherValueMode === "interpolated-forecast" && !isTerrainEstimate;
	return <aside className="detail-sheet" id="island-detail" data-testid="destination-detail" tabIndex={-1} aria-label={destination.name + "の詳細"}>
		<button className="close-sheet" type="button" onClick={onClose} aria-label="詳細を閉じる"><X/></button>
		<div className="detail-kicker">{destination.hint}</div>
		<h2>{destination.name}</h2>
		<div className="detail-facts">
			{destination.temperature !== null && <strong title={isTerrainEstimate ? "緯度と標高だけから算出した参考値" : isInterpolatedForecast ? "周辺の予報サンプルから補間した参考値" : "地点座標の11〜17時最高体感温度"}>{isTerrainEstimate ? "地形目安" : isInterpolatedForecast ? "周辺目安" : "体感"} {Math.round(destination.temperature)}℃</strong>}
			{!isTerrainEstimate && destination.airTemperature !== null && <span title="11〜17時の最高気温">気温 {Math.round(destination.airTemperature)}℃</span>}
			{destination.durationMinutes !== null && <span><Clock3/>{durationLabel(destination.durationMinutes)}</span>}
			{destination.usesAir && <span><Plane/>飛行機を含む</span>}
			{destination.station && <span><Navigation/>{destination.station}</span>}
		</div>
			<details className="temperature-note">
				<summary>{isTerrainEstimate ? "この切符の選び方" : "この温度について"}</summary>
				<p>{isTerrainEstimate ? "この切符は当日の気温ではなく、公式確認済みの冷却根拠、距離、アクセスから選んでいます。架空の温度は使いません。出発前に最新の天気と運行情報を確認してください。" : isInterpolatedForecast ? "周辺の全国予報サンプルから補間した参考値です。地点座標そのものの予報ではないため、順位を保証する値ではありません。" : "地点座標の11〜17時予報で最も高い体感温度です。木陰・水辺・舗装など現地の細かな差は、場所の特徴として別に扱います。"}</p>
		</details>
		{destination.reason && <p>{destination.reason}</p>}
		{destination.accessSummary && <div className="verified-access"><Navigation aria-hidden="true"/><span><strong>行き方</strong>{destination.accessSummary}</span></div>}
		{destination.seasonalNotes.length > 0 && <p className="seasonal-note">確認：{destination.seasonalNotes.join(" / ")}</p>}
		{destination.routeStatus === "checking"
			? <div className="route-line checking"><Route aria-hidden="true"/><div><strong>往復経路を確認しています</strong><small>島は先に開けます</small></div></div>
			: destination.routeAvailable
			? <div className="route-line"><Route aria-hidden="true"/><div><strong>{destination.routeSummary ?? "往復経路を確認済み"}</strong>{(destination.departAt || destination.arriveAt || destination.returnAt) && <small>{[destination.departAt, destination.arriveAt, destination.returnAt].filter(Boolean).join(" → ")}</small>}</div></div>
			: <div className="route-line unavailable"><Route aria-hidden="true"/><div><strong>{destination.routeReason === "provider_error" ? "経路の自動確認に失敗しました" : destination.routeReason === "access_unverified" ? "入口までの経路は未確認です" : "今の時間では日帰り経路がありません"}</strong><small>{destination.routeReason === "provider_error" ? "日帰り不可とは判定していません。少し待ってもう一度確認してください" : destination.routeReason === "access_unverified" ? "場所の出典を開いてアクセス方法を確認してください" : "時間を変えると行ける可能性があります"}</small></div></div>}
		<div className="detail-actions">
			<a className="route-fallback" data-testid="google-maps-directions" href={googleMapsDirectionsUrl(destination, origin)} target="_blank" rel="noreferrer">Google Mapsで行き方を見る<ExternalLink aria-hidden="true"/></a>
			{destination.officialUrl && <a className="official-link" href={destination.officialUrl} target="_blank" rel="noreferrer">公式情報・行き方を見る<ExternalLink aria-hidden="true"/></a>}
		</div>
	</aside>;
}
