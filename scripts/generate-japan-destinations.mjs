import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { latLngToCell } from "h3-js";

const require = createRequire(import.meta.url);
const parseOsm = require("osm-pbf-parser");

const projectRoot = path.resolve(import.meta.dirname, "..");
const cellsPath = path.join(projectRoot, "src/data/japan-weather-cells.json");
const outputPath = path.join(projectRoot, "src/data/generated-destinations.json");
const inputPaths = process.argv.slice(2).filter((value) => value !== "--");

if (!inputPaths.length) {
	console.error("Usage: pnpm generate:destinations -- /path/to/*.osm.pbf");
	process.exit(1);
}

const cellPayload = JSON.parse(fs.readFileSync(cellsPath, "utf8"));
const cells = cellPayload.cells;
const cellById = new Map(cells.map((cell) => [cell.id, cell]));
const cellBuckets = bucketPoints(cells.map((cell) => ({ ...cell, latitude: cell.lat, longitude: cell.lon })));
const candidates = [];
const anchors = [];
let latestTimestamp = 0;
const inputs = [];

for (const inputPath of inputPaths) {
	console.log(`Parsing ${inputPath}`);
	const checksum = createHash("sha256");
	await pipeline(
		fs.createReadStream(inputPath),
		new Transform({ transform(chunk, _encoding, done) { checksum.update(chunk); done(null, chunk); } }),
		parseOsm(),
		new Transform({
			objectMode: true,
			transform(items, _encoding, done) {
				for (const item of items) {
					if (item.type !== "node" || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
					latestTimestamp = Math.max(latestTimestamp, item.info?.timestamp ?? 0);
					const tags = item.tags ?? {};
					if (isBlocked(tags)) continue;
					const name = japaneseName(tags);
					const anchorKind = classifyAnchor(tags);
					if (anchorKind && name) anchors.push({ name, latitude: item.lat, longitude: item.lon, kind: anchorKind, sourceUrl: `https://www.openstreetmap.org/node/${item.id}` });
					const classification = classifyDestination(tags);
					if (!classification || !name) continue;
					const cell = resolveCell(item.lat, item.lon);
					if (!cell) continue;
					candidates.push({
						id: `osm-node-${item.id}`,
						name,
						prefecture: cell.prefectures[0] ?? "日本",
						station: "",
						latitude: round(item.lat, 6),
						longitude: round(item.lon, 6),
						categories: classification.categories,
						walking: classification.walking,
						tourismUrl: preferredUrl(tags) ?? `https://www.openstreetmap.org/node/${item.id}`,
						cellId: cell.id,
						elevationM: cell.elevationM,
						sourceId: `osm:node:${item.id}`,
						sourceUrl: `https://www.openstreetmap.org/node/${item.id}`,
						confidence: "derived",
						quality: qualityScore(tags, classification.categories),
					});
				}
				done();
			},
		}),
	);
	inputs.push({ file: path.basename(inputPath), sha256: checksum.digest("hex") });
}

console.log(`Raw named candidates: ${candidates.length}; access anchors: ${anchors.length}`);
const anchorBuckets = bucketPoints(anchors);
const deduped = deduplicate(candidates);
for (const candidate of deduped) {
	const anchor = nearestPoint(candidate, anchorBuckets, 35);
	if (anchor) {
		const accessDistanceKm = round(distanceKm(candidate, anchor), 1);
		candidate.access = {
			name: anchor.name,
			latitude: anchor.latitude,
			longitude: anchor.longitude,
			kind: anchor.kind,
			distanceKm: accessDistanceKm,
			sourceUrl: anchor.sourceUrl,
		};
		const credibleRoutePoint = (anchor.kind === "parking" && accessDistanceKm <= 1.5)
			|| (anchor.kind !== "parking" && accessDistanceKm <= 3);
		if (credibleRoutePoint) {
			candidate.station = anchor.name;
			candidate.routePoint = { latitude: anchor.latitude, longitude: anchor.longitude };
		}
	}
}

const selected = selectAcrossCells(deduped, 2)
	.map((candidate) => {
		const publicCandidate = { ...candidate };
		delete publicCandidate.quality;
		return publicCandidate;
	})
	.sort((left, right) => left.prefecture.localeCompare(right.prefecture, "ja") || left.cellId.localeCompare(right.cellId) || left.id.localeCompare(right.id));
const prefectures = new Set(selected.map((candidate) => candidate.prefecture));
const occupiedCells = new Set(selected.map((candidate) => candidate.cellId));
if (selected.length < 1_000 || prefectures.size !== 47) {
	throw new Error(`catalog_quality_failed: ${selected.length} places, ${prefectures.size} prefectures, ${occupiedCells.size} cells`);
}

const generatedAt = new Date().toISOString();
const payload = {
	version: 1,
	generatedAt,
	sourceSnapshotAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : generatedAt,
	license: "Open Database License (ODbL) 1.0",
	attribution: "© OpenStreetMap contributors",
	sourceUrl: "https://download.geofabrik.de/asia/japan.html",
	inputs,
	placeCount: selected.length,
	prefectureCount: prefectures.size,
	cellCount: occupiedCells.size,
	places: selected,
};
fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`);
console.log(`Wrote ${selected.length} places across ${occupiedCells.size} cells and ${prefectures.size} prefectures to ${outputPath}`);

function japaneseName(tags) {
	return clean(tags["name:ja"] || tags.name || tags["official_name:ja"] || tags.official_name);
}

function clean(value) {
	return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 100) : "";
}

function isBlocked(tags) {
	return ["no", "private"].includes(tags.access)
		|| tags.military
		|| tags.disused === "yes"
		|| tags.abandoned === "yes"
		|| tags.construction === "yes"
		|| Object.keys(tags).some((key) => key.startsWith("disused:") || key.startsWith("abandoned:") || key.startsWith("construction:"));
}

function classifyAnchor(tags) {
	if (tags.railway === "station" || tags.railway === "halt") return "station";
	if (tags.highway === "bus_stop" || tags.public_transport === "platform") return "bus-stop";
	if (tags.amenity === "parking") return "parking";
	return null;
}

function classifyDestination(tags) {
	if (tags.natural === "waterfall" || tags.natural === "spring" || tags.water === "lake" || tags.water === "pond") return { categories: ["water", "forest"], walking: "medium" };
	if (tags.natural === "beach") return { categories: ["coast", "water"], walking: "low" };
	if (tags.natural === "cave_entrance") return { categories: ["forest", "highland"], walking: "high" };
	if (tags.tourism === "viewpoint") return { categories: ["highland", "forest"], walking: "medium" };
	if (["alpine_hut", "wilderness_hut"].includes(tags.tourism)) return { categories: ["highland", "forest"], walking: "high" };
	if (tags.leisure === "nature_reserve") return { categories: ["forest", "water"], walking: "medium" };
	if (tags.leisure === "park" || tags.leisure === "garden") return { categories: ["forest"], walking: "low" };
	if (tags.tourism === "picnic_site") return { categories: ["forest", "water"], walking: "low" };
	if (tags.tourism === "attraction" && /渓|峡|滝|湖|沼|池|森|高原|湿原|鍾乳|洞窟|岬|海岸|湧水|泉|公園/.test(japaneseName(tags))) return { categories: inferCategories(japaneseName(tags)), walking: "medium" };
	return null;
}

function inferCategories(name) {
	const categories = [];
	if (/滝|湖|沼|池|渓|峡|湧水|泉|湿原/.test(name)) categories.push("water");
	if (/岬|海岸|浜/.test(name)) categories.push("coast");
	if (/高原|山|峠/.test(name)) categories.push("highland");
	if (/森|林|公園|渓|峡/.test(name)) categories.push("forest");
	return categories.length ? categories : ["forest"];
}

function preferredUrl(tags) {
	const value = tags.website || tags["contact:website"] || tags.url;
	return /^https?:\/\//.test(value ?? "") ? value : undefined;
}

function qualityScore(tags, categories) {
	return (tags["name:ja"] ? 12 : 0) + (tags.wikidata ? 8 : 0) + (preferredUrl(tags) ? 6 : 0)
		+ (tags.wikipedia ? 4 : 0) + (tags.tourism ? 3 : 0) + (categories.includes("highland") ? 3 : 0)
		+ (categories.includes("water") ? 2 : 0);
}

function resolveCell(lat, lon) {
	const exact = cellById.get(latLngToCell(lat, lon, cellPayload.resolution));
	if (exact) return exact;
	const nearest = nearestPoint({ latitude: lat, longitude: lon }, cellBuckets, 18);
	return nearest ? cellById.get(nearest.id) : undefined;
}

function bucketPoints(points) {
	const buckets = new Map();
	for (const point of points) {
		const key = `${Math.floor(point.latitude)}:${Math.floor(point.longitude)}`;
		const list = buckets.get(key) ?? [];
		list.push(point);
		buckets.set(key, list);
	}
	return buckets;
}

function nearestPoint(point, buckets, maximumKm) {
	let best;
	let bestDistance = maximumKm;
	const lat = Math.floor(point.latitude);
	const lon = Math.floor(point.longitude);
	for (let y = lat - 1; y <= lat + 1; y += 1) for (let x = lon - 1; x <= lon + 1; x += 1) {
		for (const candidate of buckets.get(`${y}:${x}`) ?? []) {
			const current = distanceKm(point, candidate);
			if (current < bestDistance) { best = candidate; bestDistance = current; }
		}
	}
	return best;
}

function distanceKm(left, right) {
	const radius = 6371;
	const toRadians = (degrees) => degrees * Math.PI / 180;
	const dLat = toRadians(right.latitude - left.latitude);
	const dLon = toRadians(right.longitude - left.longitude);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(dLon / 2) ** 2;
	return 2 * radius * Math.asin(Math.sqrt(a));
}

function deduplicate(items) {
	const seen = new Set();
	return items.filter((item) => {
		const key = `${item.prefecture}:${item.name.replace(/[\s・ヶケノの]/g, "").toLowerCase()}:${item.latitude.toFixed(3)}:${item.longitude.toFixed(3)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function selectAcrossCells(items, maximumPerCell) {
	const groups = new Map();
	for (const item of items) groups.set(item.cellId, [...(groups.get(item.cellId) ?? []), item]);
	return [...groups.values()].flatMap((group) => group
		.toSorted((left, right) => Number(Boolean(right.access)) - Number(Boolean(left.access)) || right.quality - left.quality || left.id.localeCompare(right.id))
		.filter((candidate, index, sorted) => index === 0 || candidate.categories[0] !== sorted[0].categories[0] || index < maximumPerCell)
		.slice(0, maximumPerCell));
}

function round(value, digits) {
	return Number(value.toFixed(digits));
}
