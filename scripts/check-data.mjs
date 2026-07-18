import { readFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

const generated = await readJson("../src/data/raw/generated-destinations.json");
const generatedReviews = await readJson("../src/data/raw/reviewed-destination-batches.json");
const curatedReviews = await readJson("../src/data/raw/reviewed-curated-batches.json");
const weatherCells = await readJson("../src/data/japan-weather-cells.json");
const prefectures = await readJson("../src/data/japan-prefectures.json");

if (generated.placeCount !== generated.places.length || generated.placeCount < 2_000) {
  throw new Error("invalid_generated_destinations");
}
if (generatedReviews.reviewCount !== generatedReviews.records.length) {
  throw new Error("invalid_generated_reviews");
}
if (curatedReviews.reviewCount !== curatedReviews.records.length) {
  throw new Error("invalid_curated_reviews");
}
if (weatherCells.cellCount < 1_000 || weatherCells.cells.length < 1_000) {
  throw new Error("invalid_weather_cells");
}
if (prefectures.type !== "FeatureCollection" || prefectures.features.length !== 47) {
  throw new Error("invalid_prefecture_map");
}

console.log(JSON.stringify({
  generatedPlaces: generated.placeCount,
  curatedSourcePlaces: 113,
  totalWorldPlaces: generated.placeCount + 113,
  generatedReviews: generatedReviews.reviewCount,
  curatedReviews: curatedReviews.reviewCount,
  weatherCells: weatherCells.cellCount,
  prefectures: prefectures.features.length,
}, null, 2));
