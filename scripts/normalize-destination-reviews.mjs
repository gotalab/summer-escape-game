import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewDirectory = path.join(root, "src/data/reviews");
const outputPath = path.join(root, "src/data/reviewed-destination-batches.json");
const generated = JSON.parse(await readFile(path.join(root, "src/data/generated-destinations.json"), "utf8"));
const files = (await readdir(reviewDirectory)).filter((file) => file.endsWith(".json")).sort();
const allowedAttributes = new Set([
  "shade", "water", "spring", "gorge", "cave", "underground", "indoor",
  "breeze", "lake-breeze", "fog", "coastal-current", "snowfield",
  "night-cooling", "forest", "highland",
]);
const allowedCoolingScopes = new Set(["ambient-air", "local-microclimate", "enclosed-space", "water-contact", "time-shift", "indoor-fallback"]);
const allowedClaimLevels = new Set(["numeric-verified", "mechanism-verified", "forecast-only", "no-cooling-claim"]);
const records = [];
const seen = new Set();

for (const file of files) {
  const entries = JSON.parse(await readFile(path.join(reviewDirectory, file), "utf8"));
  if (!Array.isArray(entries)) throw new Error(`${file}: review batch must be an array`);
  for (const entry of entries) {
    const sourceIndex = entry.sourceIndex ?? entry.index;
    const source = generated.places[sourceIndex - 1];
    const claimedId = String(entry.sourceId ?? entry.id ?? "").replace("osm:node:", "osm-node-");
    if (!Number.isInteger(sourceIndex) || !source || source.id !== claimedId) throw new Error(`${file}: source mismatch at ${sourceIndex}`);
    if (seen.has(source.id)) throw new Error(`${file}: duplicate review ${source.id}`);
    seen.add(source.id);
    if (!["publish", "block", "merge"].includes(entry.decision)) throw new Error(`${file}: invalid decision for ${source.id}`);
    if (entry.reviewedAt !== "2026-07-18") throw new Error(`${file}: invalid reviewedAt for ${source.id}`);

    const access = entry.access ?? {};
    const coordinates = entry.coordinates ?? entry.correctedCandidate ?? entry.coordinateCandidate ?? {};
    const cooling = entry.cooling ?? entry.coolness ?? {};
    const coolingAttributes = cooling.attributes ?? cooling.tags ?? [];
    if (!Array.isArray(coolingAttributes) || coolingAttributes.some((attribute) => !allowedAttributes.has(attribute))) {
      throw new Error(`${file}: invalid cooling attributes for ${source.id}`);
    }
    const coolingScope = cooling.scope ?? inferCoolingScope(coolingAttributes);
    const claimLevel = cooling.claimLevel ?? (coolingAttributes.length ? "mechanism-verified" : "no-cooling-claim");
    if (!allowedCoolingScopes.has(coolingScope) || !allowedClaimLevels.has(claimLevel)) {
      throw new Error(`${file}: invalid cooling claim metadata for ${source.id}`);
    }
    const accessEvidenceUrl = entry.accessUrl ?? access.url ?? null;
    const officialUrl = isPublicUrl(entry.officialUrl)
      ? entry.officialUrl
      : isPublicUrl(accessEvidenceUrl)
        ? accessEvidenceUrl
        : null;
    const accessSummary = entry.accessSummary ?? access.summary ?? null;
    if (entry.decision === "publish") {
      if (!isPublicUrl(officialUrl) || officialUrl.includes("openstreetmap.org")) throw new Error(`${file}: invalid official URL for ${source.id}`);
      if (!isPublicUrl(accessEvidenceUrl) || !accessSummary) throw new Error(`${file}: missing access evidence for ${source.id}`);
      if (!coolingAttributes.length) throw new Error(`${file}: missing local cooling evidence for ${source.id}`);
      if (!validCoordinate(coordinates.latitude, -90, 90) || !validCoordinate(coordinates.longitude, -180, 180)) {
        throw new Error(`${file}: missing verified coordinate for ${source.id}`);
      }
    }
    records.push({
      id: source.id,
      sourceIndex,
      state: entry.decision === "publish" ? "published" : entry.decision === "merge" ? "merged" : "blocked",
      reviewedAt: entry.reviewedAt,
      name: entry.formalName ?? source.name,
      prefecture: entry.prefecture ?? source.prefecture,
      officialUrl,
      accessEvidenceUrl,
      accessSummary,
      coolingAttributes,
      coolingScope,
      claimLevel,
      thermalEvidence: cooling.thermalEvidence ?? [],
      seasonalNotes: [entry.operationsAndSafety ?? entry.seasonalAvailabilitySafety ?? entry.seasonalClosureSafety].filter(Boolean),
      reason: cooling.summary ?? cooling.evidence ?? entry.operationsAndSafety ?? `Editorial decision: ${entry.decision}`,
      mergedInto: normalizeMergedInto(entry, generated),
      latitude: typeof coordinates.latitude === "number" ? coordinates.latitude : null,
      longitude: typeof coordinates.longitude === "number" ? coordinates.longitude : null,
      elevationM: typeof (entry.elevationM ?? coordinates.elevationM) === "number" ? (entry.elevationM ?? coordinates.elevationM) : null,
      sourceFile: file,
    });
  }
}

const counts = Object.fromEntries(["published", "blocked", "merged"].map((state) => [state, records.filter((record) => record.state === state).length]));
const serialized = `${JSON.stringify({ version: 1, sourceFiles: files, reviewCount: records.length, counts, records }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) throw new Error("reviewed-destination-batches.json is stale; run pnpm normalize:reviews");
  console.log(`verified ${records.length} normalized reviews (${counts.published} published, ${counts.blocked} blocked, ${counts.merged} merged)`);
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

function normalizeMergedInto(entry, catalog) {
  if (typeof entry.mergedInto === "string" && entry.mergedInto.startsWith("osm-node-")) return entry.mergedInto;
  if (Number.isInteger(entry.mergeIntoIndex)) return catalog.places[entry.mergeIntoIndex - 1]?.id ?? null;
  return null;
}

function inferCoolingScope(attributes) {
  if (attributes.includes("spring")) return "water-contact";
  if (attributes.some((attribute) => ["cave", "underground"].includes(attribute))) return "enclosed-space";
  if (attributes.includes("night-cooling")) return "time-shift";
  if (attributes.includes("indoor")) return "indoor-fallback";
  return "local-microclimate";
}
