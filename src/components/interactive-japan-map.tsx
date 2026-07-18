"use client";

import japanSource from "@/data/japan-prefectures.json";
import terrainSource from "@/data/japan-weather-cells.json";
import { LocateFixed, Minus, Plus, RotateCcw } from "lucide-react";
import { geoMercator, geoPath } from "d3-geo";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import type { Destination } from "./summer-escape";

type Coordinates = { latitude: number; longitude: number };
type LocationStatus = "idle" | "locating" | "found" | "unavailable";
type Props = {
	destinations: Destination[];
	selectedId: string | null;
	originId: string;
	origin?: Coordinates;
	loading: boolean;
	locationStatus: LocationStatus;
	onSelect: (id: string) => void;
	onUseCurrentLocation: () => void;
};
type Camera = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type MapGroup = "main" | "okinawa" | "pacific";
type MosaicSample = Point & { latitude: number; longitude: number; group: MapGroup; radius: number };
type TerrainPayload = { cells: Array<{ lat: number; lon: number }> };

const FULL: Camera = { x: 0, y: 0, width: 1000, height: 600 };
const PRESET_ORIGINS: Record<string, Coordinates> = {
	tokyo: { latitude: 35.6812, longitude: 139.7671 }, shinjuku: { latitude: 35.6909, longitude: 139.7003 },
	yokohama: { latitude: 35.4658, longitude: 139.6223 }, omiya: { latitude: 35.9063, longitude: 139.6241 },
	chiba: { latitude: 35.613, longitude: 140.113 }, nagoya: { latitude: 35.1709, longitude: 136.8815 },
	osaka: { latitude: 34.7025, longitude: 135.4959 }, sendai: { latitude: 38.2601, longitude: 140.8824 },
	sapporo: { latitude: 43.0686, longitude: 141.3508 }, fukuoka: { latitude: 33.5898, longitude: 130.4207 },
};

function reversePolygonRings(polygon: Position[][]): Position[][] {
	return polygon.map((ring) => [...ring].reverse());
}
function normalizedJapan(): FeatureCollection<Polygon | MultiPolygon> {
	const source = japanSource as FeatureCollection<Polygon | MultiPolygon>;
	return {
		type: "FeatureCollection",
		features: source.features.map((feature) => ({
			...feature,
			geometry: feature.geometry.type === "Polygon"
				? { type: "Polygon", coordinates: reversePolygonRings(feature.geometry.coordinates) }
				: { type: "MultiPolygon", coordinates: feature.geometry.coordinates.map(reversePolygonRings) },
		})),
	};
}
function polygonGroup(polygon: Position[][]): MapGroup {
	const ring = polygon[0] ?? [];
	const center = ring.reduce((sum, coordinate) => [sum[0] + coordinate[0], sum[1] + coordinate[1]], [0, 0]);
	const longitude = center[0] / Math.max(1, ring.length);
	const latitude = center[1] / Math.max(1, ring.length);
	if ((latitude < 29.3 && longitude < 133) || longitude < 128.6) return "okinawa";
	if (latitude < 29.3 || longitude > 147) return "pacific";
	return "main";
}
function splitJapan(source: FeatureCollection<Polygon | MultiPolygon>) {
	const groups: Record<MapGroup, Feature<Polygon>[]> = { main: [], okinawa: [], pacific: [] };
	for (const feature of source.features) {
		const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
		for (const polygon of polygons) groups[polygonGroup(polygon)].push({ type: "Feature", properties: feature.properties, geometry: { type: "Polygon", coordinates: polygon } });
	}
	return Object.fromEntries(Object.entries(groups).map(([key, features]) => [key, { type: "FeatureCollection", features }])) as Record<MapGroup, FeatureCollection<Polygon>>;
}

const JAPAN = normalizedJapan();
const JAPAN_GROUPS = splitJapan(JAPAN);
const PROJECTIONS = {
	main: geoMercator().fitExtent([[112, 40], [948, 535]], JAPAN_GROUPS.main),
	okinawa: geoMercator().fitExtent([[62, 382], [245, 520]], JAPAN_GROUPS.okinawa),
	pacific: geoMercator().fitExtent([[265, 470], [355, 565]], JAPAN_GROUPS.pacific),
} as const;
const VISIBLE_GROUPS: readonly MapGroup[] = ["main", "okinawa"];
const LAND_PATHS = Object.fromEntries((Object.keys(PROJECTIONS) as MapGroup[]).map((group) => [group, geoPath(PROJECTIONS[group])(JAPAN_GROUPS[group]) ?? ""])) as Record<MapGroup, string>;

function groupForCoordinates(latitude: number, longitude: number): MapGroup {
	if ((latitude < 29.3 && longitude < 133) || longitude < 128.6) return "okinawa";
	if (latitude < 29.3 || longitude > 147) return "pacific";
	return "main";
}
function project(latitude: number, longitude: number): Point {
	const group = groupForCoordinates(latitude, longitude);
	const result = PROJECTIONS[group]([longitude, latitude]) ?? [500, 300];
	return { x: result[0], y: result[1] };
}
function hexPath({ x, y, radius }: MosaicSample) {
	return Array.from({ length: 6 }, (_, index) => {
		const angle = Math.PI / 3 * index - Math.PI / 6;
		return `${index ? "L" : "M"}${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`;
	}).join(" ") + "Z";
}
function clampCamera(next: Camera): Camera {
	const width = Math.max(285, Math.min(1000, next.width));
	const height = width * .6;
	return { x: Math.max(-50, Math.min(1050 - width, next.x)), y: Math.max(-30, Math.min(630 - height, next.y)), width, height };
}
const MAX_VISIBLE_MARKERS = 32;

function layoutMarkers(destinations: Destination[]) {
	const placed: Array<{ destination: Destination; point: Point }> = [];
	for (const destination of destinations.filter((item) => item.reachable && groupForCoordinates(item.latitude, item.longitude) !== "pacific").slice(0, MAX_VISIBLE_MARKERS)) {
		const base = project(destination.latitude, destination.longitude);
		let point = base;
		for (let attempt = 0; attempt < 8; attempt += 1) {
			if (placed.every((entry) => Math.hypot(entry.point.x - point.x, entry.point.y - point.y) >= 25)) break;
			const angle = attempt * Math.PI * .73;
			point = { x: base.x + Math.cos(angle) * (14 + attempt * 3), y: base.y + Math.sin(angle) * (14 + attempt * 3) };
		}
		placed.push({ destination, point });
	}
	return placed;
}

export function InteractiveJapanMap({ destinations, selectedId, originId, origin: originCoordinates, loading, locationStatus, onSelect, onUseCurrentLocation }: Props) {
	const [camera, setCamera] = useState<Camera>(FULL);
	const focusedForGame = useRef(false);
	const [dragging, setDragging] = useState(false);
	const svgRef = useRef<SVGSVGElement>(null);
	const pointers = useRef(new Map<number, Point>());
	const lastPinch = useRef<number | null>(null);
	const originCoordinatesValue = originCoordinates ?? PRESET_ORIGINS[originId] ?? PRESET_ORIGINS.tokyo;
	const origin = project(originCoordinatesValue.latitude, originCoordinatesValue.longitude);
	const markers = useMemo(() => layoutMarkers(destinations), [destinations]);
	const selected = useMemo(() => destinations.find((item) => item.id === selectedId), [destinations, selectedId]);
	const cells = useMemo(() => (terrainSource as TerrainPayload).cells.flatMap((cell) => {
		const group = groupForCoordinates(cell.lat, cell.lon);
		if (!VISIBLE_GROUPS.includes(group)) return [];
		const point = project(cell.lat, cell.lon);
		return [{
			...point,
			latitude: cell.lat,
			longitude: cell.lon,
			group,
			radius: group === "okinawa" ? 4 : 5,
		}];
	}), []);
	useEffect(() => {
		if (!destinations.length || focusedForGame.current) return;
		focusedForGame.current = true;
		setCamera(clampCamera({ x: origin.x - 250, y: origin.y - 150, width: 500, height: 300 }));
	}, [destinations.length, origin.x, origin.y]);

	const zoom = useCallback((factor: number, anchor: Point = { x: 500, y: 300 }) => {
		setCamera((current) => { const nextWidth = Math.max(285, Math.min(1000, current.width * factor)); const ratio = nextWidth / current.width; return clampCamera({ x: anchor.x - (anchor.x - current.x) * ratio, y: anchor.y - (anchor.y - current.y) * ratio, width: nextWidth, height: nextWidth * .6 }); });
	}, []);
	const screenToMap = useCallback((clientX: number, clientY: number): Point => {
		const box = svgRef.current?.getBoundingClientRect();
		if (!box) return { x: 500, y: 300 };
		return { x: camera.x + ((clientX - box.left) / box.width) * camera.width, y: camera.y + ((clientY - box.top) / box.height) * camera.height };
	}, [camera]);
	const onWheel = (event: WheelEvent<SVGSVGElement>) => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.16 : .86, screenToMap(event.clientX, event.clientY)); };
	const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
		if ((event.target as Element).closest("[data-map-marker]")) return;
		event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); setDragging(true);
	};
	const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
		const previous = pointers.current.get(event.pointerId); if (!previous) return;
		pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const active = [...pointers.current.values()];
		if (active.length === 2) { const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y); if (lastPinch.current) zoom(lastPinch.current / distance, screenToMap((active[0].x + active[1].x) / 2, (active[0].y + active[1].y) / 2)); lastPinch.current = distance; return; }
		const box = svgRef.current?.getBoundingClientRect(); if (!box) return;
		const dx = ((event.clientX - previous.x) / box.width) * camera.width; const dy = ((event.clientY - previous.y) / box.height) * camera.height;
		setCamera((current) => clampCamera({ ...current, x: current.x - dx, y: current.y - dy }));
	};
	const releasePointer = (event: ReactPointerEvent<SVGSVGElement>) => { pointers.current.delete(event.pointerId); lastPinch.current = null; if (!pointers.current.size) setDragging(false); };
	const centerOn = (point: Point, width = 410) => setCamera(clampCamera({ x: point.x - width / 2, y: point.y - width * .3, width, height: width * .6 }));
	const zoomValue = Number((1000 / camera.width).toFixed(2)).toString();

	return <div className={`interactive-map ${dragging ? "is-dragging" : ""}`} data-testid="tide-map" data-zoom={zoomValue}>
		<svg ref={svgRef} className="tide-map" viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} role="img" aria-labelledby="map-title map-desc" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={releasePointer} onPointerCancel={releasePointer}>
			<title id="map-title">逃走フィールドを重ねた日本地図</title><desc id="map-desc">国土地理院の日本地図をもとに、現在地と実在する逃げ先を表示します。六角形はゲームのフィールドで、気温を表すものではありません。</desc>
			<defs>
				<radialGradient id="seaHeat" cx="50%" cy="43%"><stop stopColor="#ffbd70"/><stop offset=".65" stopColor="#f69049"/><stop offset="1" stopColor="#e96d43"/></radialGradient>
				<filter id="mapLandShadow"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#8d422c" floodOpacity=".25"/></filter>
				<pattern id="mapRipples" width="150" height="110" patternUnits="userSpaceOnUse"><path d="M-20 56 C18 38 45 74 82 53s73-12 104 4" fill="none" stroke="white" strokeOpacity=".12" strokeWidth="2"/></pattern>
			</defs>
			<rect x="-100" y="-100" width="1200" height="800" fill="url(#seaHeat)"/><rect x="-100" y="-100" width="1200" height="800" fill="url(#mapRipples)"/>
			<g className="official-land" filter="url(#mapLandShadow)">{VISIBLE_GROUPS.map((group) => <path key={group} d={LAND_PATHS[group]}/>)}</g>
			<g className="temperature-mosaic is-neutral" aria-hidden="true" data-rendered-cell-count={cells.length}>
				{cells.map((cell, index) => <path key={`${cell.group}-${index}`} d={hexPath(cell)}/>)}
			</g>
			<g className="official-boundaries">{VISIBLE_GROUPS.map((group) => <path key={group} d={LAND_PATHS[group]}/>)}</g>
			<g className="map-inset-labels" aria-hidden="true"><text x="61" y="388">南西諸島（別枠）</text></g>
			<g className="origin-pulse" transform={`translate(${origin.x} ${origin.y})`}><circle className="pulse p1" r="22"/><circle className="pulse p2" r="22"/><circle r="12" fill="#e9ffff" stroke="#31d8e5" strokeWidth="5"/><circle r="4" fill="#0796b2"/></g>
			<g className={loading ? "candidate-layer is-loading" : "candidate-layer"} data-testid="island-list">
				{markers.map(({ destination, point }, index) => <g key={destination.id} className={`map-candidate ${destination.id === selectedId ? "is-selected" : ""}`} transform={`translate(${point.x} ${point.y})`} data-map-marker="true" role="button" tabIndex={0} data-testid="island-card" aria-label={destination.name} onClick={(event) => { event.stopPropagation(); onSelect(destination.id); centerOn(point, 430); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(destination.id); centerOn(point, 430); } }}><circle className="candidate-halo" r="17"/><circle className="candidate-dot" r="10"/><text y="4">{index + 1}</text><text className="island-accessible-name">{destination.name}</text></g>)}
			</g>
		</svg>
		<div className="temperature-legend"><details className="map-temperature-note"><summary>逃走フィールド 1,819マス <span aria-hidden="true">ⓘ</span></summary><p>六角形は猛暑に追われるゲーム演出です。切符は、公式確認済みの木陰・水辺・洞窟・屋内などの冷却根拠と現在地からの距離で選びます。</p></details></div>
		<nav className="map-controls" aria-label="地図の操作"><button type="button" onClick={() => zoom(.72)} aria-label="拡大" data-testid="map-zoom-in"><Plus/></button><button type="button" onClick={() => zoom(1.38)} aria-label="縮小" data-testid="map-zoom-out"><Minus/></button><button type="button" onClick={() => centerOn(origin)} aria-label="出発地へ移動" data-testid="map-locate"><LocateFixed/></button><button type="button" onClick={onUseCurrentLocation} aria-label={locationStatus === "locating" ? "現在地を確認中" : "現在地を使う"} data-testid="use-current-location"><span className="location-dot"/></button><button type="button" onClick={() => setCamera(FULL)} aria-label="日本全体を表示" data-testid="map-reset"><RotateCcw/></button></nav>
		<div className="map-attribution">地球地図日本（国土地理院）を加工して作成 · 推薦地点 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div>
		<div className="map-hint" aria-hidden="true">つまんで、地図を見る</div>
		{selected && <button type="button" className="selected-return" onClick={() => centerOn(project(selected.latitude, selected.longitude), 430)}>選択地へ</button>}
	</div>;
}
