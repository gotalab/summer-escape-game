import type { DestinationCategory, WalkingLevel } from "@/data/types";

export interface DuelCandidate {
  id: string;
  categories: readonly DestinationCategory[];
  walking: WalkingLevel;
  distanceKm: number;
  apparentTemperature: number;
  precipitationProbability: number;
  windSpeed: number;
  score: number;
  prefecture: string;
}

export interface DuelAnswer {
  questionId: string;
  choiceId: string;
}

export interface DuelChoice {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  remainingCount: number;
}

export interface DuelQuestion {
  id: string;
  prompt: string;
  choices: [DuelChoice, DuelChoice];
}

export interface DuelQuestionOptions {
  /** Weather-derived axes are unavailable for terrain-only fallback data. */
  includeForecastAxes?: boolean;
}

const AXES = ["landscape", "temperature", "distance", "rain", "shelter", "walking", "breeze"] as const;
type Axis = (typeof AXES)[number];
interface Partition {
  axis: Axis;
  questionId: string;
  prompt: string;
  left: Omit<DuelChoice, "remainingCount">;
  right: Omit<DuelChoice, "remainingCount">;
  classify: (candidate: DuelCandidate) => string;
  priority: number;
}

const axisOf = (questionId: string) => questionId.split(":", 1)[0] as Axis;
const isAxis = (value: string): value is Axis => (AXES as readonly string[]).includes(value);

const PROMPTS: Record<Axis, readonly string[]> = {
  landscape: ["涼しさの効果音、水？ 葉っぱ？", "ラムネを冷やす川？ 昼寝できる森？", "地図を青く塗る？ 緑に塗る？", "靴を脱ぐ？ 木陰に溶ける？", "カワセミを探す？ 苔を探す？", "足音を消すなら、水音？ 葉音？"],
  temperature: ["扇風機で勝つ？ 上着を探す？", "汗を止める？ 夏を忘れる？", "アイスが溶ける前？ 震える一歩手前？", "日陰で十分？ 標高に本気を出させる？", "涼しい顔で帰る？ 冷えた顔で帰る？", "冷房一段ぶん？ 季節ひとつぶん？"],
  distance: ["改札の向こう？ 搭乗口の向こう？", "朝ごはんの後に出る？ 夜明けを連れ出す？", "いつもの路線の先？ 地図を折り直す先？", "近所の秘密？ 日本の反対側？", "電車の窓を眺める？ 雲の上を眺める？", "帰り道も知ってる旅？ 初めての空路？"],
  rain: ["サンダルで行く？ 長靴も仲間にする？", "青空を集める？ 雨音を集める？", "写真の光？ 苔のつや？", "傘を置く？ 傘で冒険する？", "雲を避ける？ 雲に隠れる？", "晴れを確保？ 涼しさを優先？"],
  shelter: ["風にほどかれる？ 建物にかくまわれる？", "木陰の席？ 冷房の席？", "空を見上げる？ 地下へ潜る？", "森の屋根？ 本物の屋根？", "靴のまま自然へ？ 扉を開けて館内へ？", "外で遊ぶ？ 中で回復する？"],
  walking: ["ベンチを予約？ 小径を開拓？", "歩数を忘れる？ 景色を数える？", "足を休ませる？ 足跡を残す？", "駅からすぐ？ 最後の坂も冒険？", "涼しさに座る？ 涼しさを追う？", "体力を持ち帰る？ 思い出を持ち帰る？"],
  breeze: ["前髪を守る？ 風に任せる？", "木陰で止まる？ 風を追いかける？", "静かな苔？ 鳴る風鈴？", "空気に包まれる？ 風を浴びる？", "無風の深い森？ 頬を抜ける風？", "ページを開く風？ 帽子を飛ばす風？"],
};

function variantFor(axis: Axis, candidates: DuelCandidate[], encodedId?: string, seed = ""): number {
  const encoded = encodedId?.split(":").find((part) => /^v[0-5]$/.test(part));
  if (encoded) return Number(encoded.slice(1));
  let hash = axis.length;
  for (let index = 0; index < seed.length; index += 1) hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0;
  for (const candidate of candidates) {
    const value = `${candidate.id}:${candidate.apparentTemperature}:${candidate.precipitationProbability}:${candidate.windSpeed}`;
    for (let index = 0; index < value.length; index += 1) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % PROMPTS[axis].length;
}

function encodedQuestionId(axis: Axis, candidates: DuelCandidate[], threshold?: number, encodedId?: string, seed = ""): string {
  const variant = variantFor(axis, candidates, encodedId, seed);
  return threshold === undefined ? `${axis}:v${variant}` : `${axis}:${threshold}:v${variant}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function landscape(candidate: DuelCandidate): "water" | "green" {
  for (const category of candidate.categories) {
    if (category === "water" || category === "coast") return "water";
    if (category === "forest" || category === "highland") return "green";
  }
  return candidate.id.length % 2 ? "water" : "green";
}

function partitionFor(axis: Axis, candidates: DuelCandidate[], encodedId?: string, seed = ""): Partition {
  const variant = variantFor(axis, candidates, encodedId, seed);
  if (axis === "landscape") return {
    axis, questionId: encodedQuestionId(axis, candidates, undefined, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 7,
    left: { id: "water", label: "水辺", sublabel: "湖・川・海風へ", icon: "water" },
    right: { id: "green", label: "森・高原", sublabel: "高原・木陰へ", icon: "forest" },
    classify: landscape,
  };
  if (axis === "walking") return {
    axis, questionId: encodedQuestionId(axis, candidates, undefined, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 2,
    left: { id: "easy", label: "のんびり", sublabel: "歩く量は少なめ", icon: "seat" },
    right: { id: "active", label: "少し冒険", sublabel: "景色を探しに行く", icon: "walk" },
    classify: (candidate) => candidate.walking === "low" ? "easy" : "active",
  };
  const encodedThreshold = encodedId?.split(":")[1];
  if (axis === "distance") {
    const threshold = encodedThreshold === undefined ? Math.round(median(candidates.map((candidate) => candidate.distanceKm))) : Number(encodedThreshold);
    return {
      axis, questionId: encodedQuestionId(axis, candidates, threshold, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 5,
      left: { id: "near", label: "近くの盲点", sublabel: "鉄道・車の旅", icon: "near" },
      right: { id: "far", label: "遠くの別世界", sublabel: "飛行機圏も残す", icon: "train" },
      classify: (candidate) => candidate.distanceKm <= threshold ? "near" : "far",
    };
  }
  if (axis === "temperature") {
    const threshold = encodedThreshold === undefined ? Number(median(candidates.map((candidate) => candidate.apparentTemperature)).toFixed(1)) : Number(encodedThreshold);
    return {
      axis, questionId: encodedQuestionId(axis, candidates, threshold, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 6,
      left: { id: "mild", label: "ほどよく", sublabel: "景色とのバランス", icon: "sun" },
      right: { id: "deep", label: "本気で避暑", sublabel: `体感${threshold}℃より涼しく`, icon: "snow" },
      classify: (candidate) => candidate.apparentTemperature >= threshold ? "mild" : "deep",
    };
  }
  if (axis === "rain") {
    const threshold = encodedThreshold === undefined ? Math.round(median(candidates.map((candidate) => candidate.precipitationProbability))) : Number(encodedThreshold);
    return {
      axis, questionId: encodedQuestionId(axis, candidates, threshold, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 4,
      left: { id: "dry", label: "晴れ寄り", sublabel: "雨をなるべく避ける", icon: "sun" },
      right: { id: "rain-ok", label: "雨もあり", sublabel: "涼しさを優先", icon: "rain" },
      classify: (candidate) => candidate.precipitationProbability <= threshold ? "dry" : "rain-ok",
    };
  }
  if (axis === "shelter") return {
    axis, questionId: encodedQuestionId(axis, candidates, undefined, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 3,
    left: { id: "inside", label: "屋内", sublabel: "施設でゆっくり", icon: "inside" },
    right: { id: "outside", label: "外の涼しさ", sublabel: "自然に浸る", icon: "outside" },
    classify: (candidate) => candidate.categories.includes("indoor") ? "inside" : "outside",
  };
  const threshold = encodedThreshold === undefined ? Number(median(candidates.map((candidate) => candidate.windSpeed)).toFixed(1)) : Number(encodedThreshold);
  return {
    axis, questionId: encodedQuestionId(axis, candidates, threshold, encodedId, seed), prompt: PROMPTS[axis][variant], priority: 1,
    left: { id: "calm", label: "静かな木陰", sublabel: "穏やかに過ごす", icon: "calm" },
    right: { id: "windy", label: "風の通り道", sublabel: `${threshold}km/h以上`, icon: "wind" },
    classify: (candidate) => candidate.windSpeed < threshold ? "calm" : "windy",
  };
}

/** Replays encoded questions in order, making the stateless API deterministic. */
export function applyDuelAnswers(candidates: DuelCandidate[], answers: readonly DuelAnswer[]): DuelCandidate[] {
  return answers.reduce((remaining, answer) => {
    const axis = axisOf(answer.questionId);
    if (!isAxis(axis)) return remaining;
    const partition = partitionFor(axis, remaining, answer.questionId);
    const validChoices = [partition.left.id, partition.right.id];
    if (!validChoices.includes(answer.choiceId)) return remaining;
    return remaining.filter((candidate) => partition.classify(candidate) === answer.choiceId);
  }, [...candidates]);
}

/**
 * Validates the self-describing question token without requiring live weather
 * values to be byte-for-byte identical to the previous request. This keeps a
 * forecast refresh between taps from freezing the three-step flow.
 */
export function validateDuelAnswers(candidates: DuelCandidate[], answers: readonly DuelAnswer[]): boolean {
  const answeredAxes = new Set<Axis>();
  let remaining = [...candidates];
  for (const answer of answers) {
    const axis = axisOf(answer.questionId);
    if (!isAxis(axis) || answeredAxes.has(axis)) return false;
    const partition = partitionFor(axis, remaining, answer.questionId);
    if (partition.questionId !== answer.questionId) return false;
    if (![partition.left.id, partition.right.id].includes(answer.choiceId)) return false;
    remaining = remaining.filter((candidate) => partition.classify(candidate) === answer.choiceId);
    answeredAxes.add(axis);
  }
  return true;
}

/** Keeps every candidate in play and turns answers into preference signals. */
export function rankDuelCandidates<T extends DuelCandidate>(candidates: readonly T[], answers: readonly DuelAnswer[]): T[] {
  return candidates.map((candidate) => {
    const preferenceScore = answers.reduce((bonus, answer, index) => {
      const axis = axisOf(answer.questionId);
      if (!isAxis(axis)) return bonus;
      const partition = partitionFor(axis, [...candidates], answer.questionId);
      const matches = partition.classify(candidate) === answer.choiceId;
      return bonus + (matches ? 18 - index * 2 : -3);
    }, 0);
    return { ...candidate, score: candidate.score + preferenceScore };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Chooses the most balanced unanswered split, with semantic axes winning ties. */
export function nextDuelQuestion(candidates: DuelCandidate[], answers: readonly DuelAnswer[], seed = "", options: DuelQuestionOptions = {}): DuelQuestion | null {
  if (candidates.length < 4 || answers.length >= 3) return null;
  const answeredAxes = new Set(answers.map((answer) => axisOf(answer.questionId)));
  const unavailableAxes = options.includeForecastAxes === false
    ? new Set<Axis>(["temperature", "rain", "breeze"])
    : new Set<Axis>();
  const partitions = AXES
    .filter((axis) => !answeredAxes.has(axis) && !unavailableAxes.has(axis))
    .map((axis) => partitionFor(axis, candidates, undefined, seed));
  const viable = partitions.flatMap((partition) => {
    const leftCount = candidates.filter((candidate) => partition.classify(candidate) === partition.left.id).length;
    const rightCount = candidates.length - leftCount;
    if (Math.min(leftCount, rightCount) < 2) return [];
    const balance = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount);
    // The candidate seed shuffles viable axes strongly enough that every run
    // does not collapse into the statistically neatest distance question.
    const deckKey = `${seed}:${partition.axis}:${answers.length}:${candidates.map((candidate) => candidate.id).join("|")}`;
    let deckHash = 17;
    for (let index = 0; index < deckKey.length; index += 1) deckHash = (Math.imul(deckHash, 33) + deckKey.charCodeAt(index)) | 0;
    const deckBonus = Math.abs(deckHash) % 140;
    // Surprise belongs in which equally-useful question appears, not in a
    // wildly lopsided split. Balance dominates so a 32-card play reliably
    // stays alive for all three taps; the seed still rotates close ties.
    return [{ partition, leftCount, rightCount, rank: balance * 1_000 + deckBonus + partition.priority }];
  }).sort((a, b) => b.rank - a.rank || a.partition.axis.localeCompare(b.partition.axis));
  const selected = viable[0];
  if (!selected) return null;
  return {
    id: selected.partition.questionId,
    prompt: selected.partition.prompt,
    choices: [
      { ...selected.partition.left, remainingCount: selected.leftCount },
      { ...selected.partition.right, remainingCount: selected.rightCount },
    ],
  };
}

function jaccard(a: readonly DestinationCategory[], b: readonly DestinationCategory[]): number {
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

/** Maximal-marginal-relevance selection: quality first, then different experiences. */
export function diversityRerank<T extends DuelCandidate>(candidates: readonly T[], limit = 3): T[] {
  const remaining = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected: T[] = [];
  const scores = remaining.map((candidate) => candidate.score);
  const min = Math.min(...scores);
  const range = Math.max(1, Math.max(...scores) - min);
  while (remaining.length && selected.length < limit) {
    const ranked = remaining.map((candidate) => {
      const quality = (candidate.score - min) / range;
      const similarity = selected.length ? Math.max(...selected.map((picked) => {
        const samePrefecture = picked.prefecture === candidate.prefecture ? 0.25 : 0;
        const categorySimilarity = jaccard(picked.categories, candidate.categories) * 0.55;
        const distanceSimilarity = Math.max(0, 1 - Math.abs(picked.distanceKm - candidate.distanceKm) / 300) * 0.2;
        return samePrefecture + categorySimilarity + distanceSimilarity;
      })) : 0;
      return { candidate, mmr: quality * 0.68 - similarity * 0.32 };
    }).sort((a, b) => b.mmr - a.mmr || b.candidate.score - a.candidate.score || a.candidate.id.localeCompare(b.candidate.id));
    const winner = ranked[0].candidate;
    selected.push(winner);
    remaining.splice(remaining.findIndex((candidate) => candidate.id === winner.id), 1);
  }
  return selected;
}
