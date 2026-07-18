import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewDirectory = path.join(root, "src/data/curated-reviews");
const outputPath = path.join(root, "src/data/reviewed-curated-batches.json");
const sourceText = await readFile(path.join(root, "src/data/destinations.ts"), "utf8");
const sourceIds = [...sourceText.matchAll(/^\s{2}\["([^"]+)"/gm)].map((match) => match[1]);
if (sourceIds.length < 100) throw new Error(`expected at least 100 curated sources, found ${sourceIds.length}`);

const files = (await readdir(reviewDirectory)).filter((file) => file.endsWith(".json")).sort();
const allowedAttributes = new Set([
  "shade", "water", "spring", "gorge", "cave", "underground", "indoor",
  "breeze", "lake-breeze", "fog", "coastal-current", "snowfield",
  "night-cooling", "forest", "highland",
]);
const records = [];
const seen = new Set();

for (const file of files) {
  const entries = JSON.parse(await readFile(path.join(reviewDirectory, file), "utf8"));
  if (!Array.isArray(entries)) throw new Error(`${file}: review batch must be an array`);
  for (const entry of entries) {
    const sourceIndex = entry.sourceIndex;
    const sourceId = sourceIds[sourceIndex - 1];
    if (!Number.isInteger(sourceIndex) || !sourceId || sourceId !== entry.sourceId) {
      throw new Error(`${file}: source mismatch at ${sourceIndex}`);
    }
    const id = `curated:${sourceId}`;
    if (seen.has(id)) throw new Error(`${file}: duplicate review ${id}`);
    seen.add(id);
    if (!["publish", "block", "merge"].includes(entry.decision)) throw new Error(`${file}: invalid decision for ${id}`);
    if (entry.reviewedAt !== "2026-07-18") throw new Error(`${file}: invalid reviewedAt for ${id}`);

    const rawAttributes = entry.cooling?.attributes ?? [];
    const attributes = Array.isArray(rawAttributes) ? rawAttributes.map((attribute) => attribute === "wind" ? "breeze" : attribute) : rawAttributes;
    if (!Array.isArray(attributes) || attributes.some((attribute) => !allowedAttributes.has(attribute))) {
      throw new Error(`${file}: invalid cooling attributes for ${id}`);
    }
    if (entry.decision === "publish") {
      if (!isPublicUrl(entry.officialUrl) || entry.officialUrl.includes("openstreetmap.org")) throw new Error(`${file}: invalid official URL for ${id}`);
      if (!isPublicUrl(entry.accessUrl) || !entry.accessSummary) throw new Error(`${file}: missing access evidence for ${id}`);
      // A hot but visitable attraction still belongs in the discovery
      // population. Forecast data ranks it; editorial review only verifies
      // that it is a real, actionable place. Cooling attributes remain
      // evidence-bound and may therefore be empty.
      if (!validCoordinate(entry.coordinates?.latitude, -90, 90) || !validCoordinate(entry.coordinates?.longitude, -180, 180)) {
        throw new Error(`${file}: missing verified coordinate for ${id}`);
      }
    }

    records.push({
      id,
      sourceIndex,
      state: entry.decision === "publish" ? "published" : entry.decision === "merge" ? "merged" : "blocked",
      reviewedAt: entry.reviewedAt,
      name: entry.formalName ?? entry.sourceName,
      prefecture: entry.prefecture,
      officialUrl: isPublicUrl(entry.officialUrl) ? entry.officialUrl : null,
      accessEvidenceUrl: isPublicUrl(entry.accessUrl) ? entry.accessUrl : null,
      accessSummary: entry.accessSummary ?? null,
      coolingAttributes: attributes,
      coolingScope: entry.cooling?.scope ?? inferCoolingScope(attributes),
      claimLevel: entry.cooling?.claimLevel ?? (attributes.length ? "mechanism-verified" : "no-cooling-claim"),
      thermalEvidence: entry.cooling?.thermalEvidence ?? [],
      seasonalNotes: [entry.operationsAndSafety].filter(Boolean),
      reason: entry.cooling?.summary ?? entry.operationsAndSafety ?? `Editorial decision: ${entry.decision}`,
      mergedInto: null,
      latitude: typeof entry.coordinates?.latitude === "number" ? entry.coordinates.latitude : null,
      longitude: typeof entry.coordinates?.longitude === "number" ? entry.coordinates.longitude : null,
      elevationM: typeof entry.elevationM === "number" ? entry.elevationM : null,
      sourceFile: file,
    });
  }
}

if (records.length !== sourceIds.length || seen.size !== sourceIds.length) {
  const missing = sourceIds.filter((id) => !seen.has(`curated:${id}`));
  throw new Error(`curated review coverage incomplete: ${records.length}/100; missing ${missing.join(", ")}`);
}
records.sort((left, right) => left.sourceIndex - right.sourceIndex);
const counts = Object.fromEntries(["published", "blocked", "merged"].map((state) => [state, records.filter((record) => record.state === state).length]));
const serialized = `${JSON.stringify({ version: 1, sourceFiles: files, reviewCount: records.length, counts, records }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) throw new Error("reviewed-curated-batches.json is stale; run pnpm normalize:curated-reviews");
  console.log(`verified ${records.length} curated reviews (${counts.published} published, ${counts.blocked} blocked, ${counts.merged} merged)`);
} else {
  await writeFile(outputPath, serialized);
  console.log(`wrote ${path.relative(root, outputPath)}: ${records.length} reviews (${counts.published} published, ${counts.blocked} blocked, ${counts.merged} merged)`);
}

function isPublicUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function validCoordinate(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function inferCoolingScope(attributes) {
  if (attributes.includes("spring")) return "water-contact";
  if (attributes.some((attribute) => ["cave", "underground"].includes(attribute))) return "enclosed-space";
  if (attributes.includes("night-cooling")) return "time-shift";
  if (attributes.includes("indoor")) return "indoor-fallback";
  return "local-microclimate";
}
