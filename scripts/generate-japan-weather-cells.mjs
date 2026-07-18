import { readFile, writeFile } from "node:fs/promises";
import { cellToChildren, cellToLatLng, latLngToCell, polygonToCells } from "h3-js";
import { PNG } from "pngjs";

const RESOLUTION = 5;
const SAMPLE_RESOLUTION = 7;
const ELEVATION_ZOOM = 8;
const TILE_CONCURRENCY = 6;
const sourcePath = new URL("../src/data/japan-prefectures.json", import.meta.url);
const outputPath = new URL("../src/data/japan-weather-cells.json", import.meta.url);

const PREFECTURES = [
	"北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
	"埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
	"岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
	"鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
	"佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function polygonsOf(geometry) {
	return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function groupFor(latitude, longitude) {
	if ((latitude < 29.3 && longitude < 133) || longitude < 128.6) return "okinawa";
	if (latitude < 29.3 || longitude > 147) return "pacific-islands";
	if (latitude >= 41.3) return "hokkaido";
	return "main";
}

function round(value, digits = 5) {
	return Number(value.toFixed(digits));
}

function tilePosition(point) {
	const scale = 2 ** ELEVATION_ZOOM;
	const xFloat = ((point.lon + 180) / 360) * scale;
	const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat)) * Math.PI / 180;
	const yFloat = (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * scale;
	const x = Math.floor(xFloat);
	const y = Math.floor(yFloat);
	return { x, y, pixelX: Math.min(255, Math.floor((xFloat - x) * 256)), pixelY: Math.min(255, Math.floor((yFloat - y) * 256)) };
}

function elevationFromTile(tile, pixelX, pixelY) {
	if (!tile) return null;
	const offset = (pixelY * 256 + pixelX) * 4;
	const red = tile.data[offset];
	const green = tile.data[offset + 1];
	const blue = tile.data[offset + 2];
	if (red === 128 && green === 0 && blue === 0) return null;
	const encoded = red * 65_536 + green * 256 + blue;
	return (encoded < 8_388_608 ? encoded : encoded - 16_777_216) * .01;
}

async function fetchTile(dataset, key) {
	const [x, y] = key.split("/");
	const response = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/${dataset}/${ELEVATION_ZOOM}/${x}/${y}.png`, {
		headers: { Accept: "image/png", "User-Agent": "summer-escape-cell-generator/1.0" },
		signal: AbortSignal.timeout(20_000),
	});
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`gsi_${dataset}_${response.status}`);
	return PNG.sync.read(Buffer.from(await response.arrayBuffer()));
}

async function fetchTiles(dataset, keys) {
	const tiles = new Map();
	let cursor = 0;
	await Promise.all(Array.from({ length: TILE_CONCURRENCY }, async () => {
		while (true) {
			const index = cursor++;
			const key = keys[index];
			if (!key) return;
			tiles.set(key, await fetchTile(dataset, key));
			if ((index + 1) % 20 === 0 || index + 1 === keys.length) process.stdout.write(`\r${dataset} tiles ${Math.min(index + 1, keys.length)}/${keys.length}`);
		}
	}));
	process.stdout.write("\n");
	return tiles;
}

async function fetchElevations(points) {
	const located = points.map((point) => ({ point, ...tilePosition(point) }));
	const keys = [...new Set(located.map(({ x, y }) => `${x}/${y}`))].sort();
	console.log(`Loading ${keys.length} official GSI DEM10B tiles.`);
	const primary = await fetchTiles("dem_png", keys);
	const fallbackKeys = [...new Set(located.flatMap(({ x, y, pixelX, pixelY }) => elevationFromTile(primary.get(`${x}/${y}`), pixelX, pixelY) === null ? [`${x}/${y}`] : []))].sort();
	const fallback = fallbackKeys.length ? await fetchTiles("demgm_png", fallbackKeys) : new Map();
	return located.map(({ x, y, pixelX, pixelY }) => {
		const key = `${x}/${y}`;
		return elevationFromTile(primary.get(key), pixelX, pixelY) ?? elevationFromTile(fallback.get(key), pixelX, pixelY) ?? 0;
	});
}

const japan = JSON.parse(await readFile(sourcePath, "utf8"));
const cells = new Map();

for (const [featureIndex, feature] of japan.features.entries()) {
	const prefecture = PREFECTURES[featureIndex] ?? feature.properties?.nam ?? `prefecture-${featureIndex + 1}`;
	for (const polygon of polygonsOf(feature.geometry)) {
		const polygonCells = polygonToCells(polygon, RESOLUTION, true);
		const fallback = polygonCells.length ? [] : [latLngToCell(polygon[0][0][1], polygon[0][0][0], RESOLUTION)];
		for (const cellId of [...polygonCells, ...fallback]) {
			const current = cells.get(cellId) ?? { prefectures: new Set(), islandAnchors: [] };
			current.prefectures.add(prefecture);
			if (!polygonCells.length) current.islandAnchors.push({ lat: polygon[0][0][1], lon: polygon[0][0][0] });
			cells.set(cellId, current);
		}
	}
}

const orderedCells = [...cells.entries()].sort(([left], [right]) => left.localeCompare(right));
console.log(`Generated ${orderedCells.length} H3 land cells at resolution ${RESOLUTION}.`);
if (process.argv.includes("--dry-run")) process.exit(0);

const allSamples = [];
const cellSamples = orderedCells.map(([cellId, metadata]) => {
	const [centerLat, centerLon] = cellToLatLng(cellId);
	const samples = [{ lat: round(centerLat), lon: round(centerLon), kind: "center" }];
	samples.push(...cellToChildren(cellId, SAMPLE_RESOLUTION).map((childId) => {
		const [lat, lon] = cellToLatLng(childId);
		return { lat: round(lat), lon: round(lon), kind: "terrain" };
	}));
	for (const anchor of metadata.islandAnchors) samples.push({ lat: round(anchor.lat), lon: round(anchor.lon), kind: "island-anchor" });
	const offset = allSamples.length;
	allSamples.push(...samples);
	return { cellId, metadata, samples, offset };
});

console.log(`Resolving elevation for ${allSamples.length} terrain samples.`);
const elevations = await fetchElevations(allSamples);

const outputCells = cellSamples.map(({ cellId, metadata, samples, offset }) => {
	const elevated = samples.map((sample, index) => ({ ...sample, elevationM: Math.round(elevations[offset + index]) }));
	const sorted = elevated.toSorted((left, right) => right.elevationM - left.elevationM);
	const center = elevated.find((sample) => sample.kind === "center") ?? elevated[0];
	const [latitude, longitude] = cellToLatLng(cellId);
	const highest = sorted[0];
	const lowest = sorted.at(-1);
	return {
		id: cellId,
		lat: round(latitude),
		lon: round(longitude),
		group: groupFor(latitude, longitude),
		prefectures: [...metadata.prefectures].sort(),
		elevationM: center?.elevationM ?? 0,
		elevationRangeM: Math.max(0, (highest?.elevationM ?? 0) - (lowest?.elevationM ?? 0)),
		highPoint: highest ? { lat: highest.lat, lon: highest.lon, elevationM: highest.elevationM } : null,
	};
});

const payload = {
	version: 1,
	generatedAt: new Date().toISOString(),
	resolution: RESOLUTION,
	sampleResolution: SAMPLE_RESOLUTION,
	cellCount: outputCells.length,
	sources: [
		{ name: "地球地図日本（国土地理院）", role: "land geometry", url: "https://www.gsi.go.jp/kankyochiri/gm_jpn.html" },
		{ name: "地理院タイル DEM10B / 地球地図全球版標高", role: "elevation", url: "https://maps.gsi.go.jp/development/ichiran.html#dem" },
	],
	cells: outputCells,
};

await writeFile(outputPath, JSON.stringify(payload));
console.log(`Wrote ${outputCells.length} cells to ${outputPath.pathname}`);
