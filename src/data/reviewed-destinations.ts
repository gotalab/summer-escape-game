import reviewBatchData from "./generated-destination-reviews-37-60.json";
import normalizedCuratedReviewData from "./reviewed-curated-batches.json";
import normalizedReviewData from "./reviewed-destination-batches.json";
import type {
  Destination,
  DestinationReview,
  LocalCoolingAttribute,
  CoolingClaimLevel,
  CoolingScope,
} from "./types";

export type ReviewedDestinationOverride = Partial<Omit<Destination, "id">> & {
  review: DestinationReview;
};

const reviewedAt = "2026-07-18";

interface NormalizedReviewRecord {
  id: string;
  state: DestinationReview["state"];
  reviewedAt: string;
  name: string;
  prefecture: string;
  officialUrl: string | null;
  accessEvidenceUrl: string | null;
  accessSummary: string | null;
  coolingAttributes: LocalCoolingAttribute[];
  coolingScope?: CoolingScope;
  claimLevel?: CoolingClaimLevel;
  thermalEvidence?: DestinationReview["thermalEvidence"];
  seasonalNotes: string[];
  reason: string;
  mergedInto: string | null;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
}

const normalizedReviews = normalizedReviewData as {
  version: number;
  reviewCount: number;
  counts: { published: number; blocked: number; merged: number };
  records: NormalizedReviewRecord[];
};

const normalizedCuratedReviews = normalizedCuratedReviewData as typeof normalizedReviews;

if (normalizedReviews.version !== 1 || normalizedReviews.reviewCount !== normalizedReviews.records.length
  || normalizedCuratedReviews.version !== 1 || normalizedCuratedReviews.reviewCount !== normalizedCuratedReviews.records.length) {
  throw new Error("invalid_reviewed_destination_batches");
}

const normalizedReviewRecords = [...normalizedReviews.records, ...normalizedCuratedReviews.records];
if (new Set(normalizedReviewRecords.map(({ id }) => id)).size !== normalizedReviewRecords.length) {
  throw new Error("duplicate_normalized_destination_review");
}

export const REVIEW_BATCH_METADATA = {
  version: 1,
  reviewCount: normalizedReviewRecords.length,
  published: normalizedReviews.counts.published + normalizedCuratedReviews.counts.published,
  blocked: normalizedReviews.counts.blocked + normalizedCuratedReviews.counts.blocked,
  merged: normalizedReviews.counts.merged + normalizedCuratedReviews.counts.merged,
} as const;

// Human-reviewed overrides are intentionally separate from the generated OSM
// discovery catalog. OSM supplies nationwide coverage; only records with a
// published review may become an actionable travel recommendation.
const existingReviewedDestinationOverrides = {
  "osm-node-4524335189": {
    name: "おまちアクアガーデン",
    prefecture: "岡山県",
    station: "施設駐車場（13台）",
    categories: ["water"],
    walking: "low",
    tourismUrl: "https://www.city.okayama.jp/shisei/0000007520.html",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 34.686183, longitude: 133.972505 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.city.okayama.jp/shisei/0000007520.html",
      accessEvidenceUrl: "https://www.city.okayama.jp/shisei/0000007520.html",
      accessSummary: "施設駐車場13台。開園時間と休園日を確認して訪問。",
      coolingAttributes: ["water"],
      seasonalNotes: ["開園時間は9時〜18時", "施設の水は煮沸せず飲用しない"],
      reason: "自治体公式ページで親水施設、所在地、駐車場、利用条件を確認済み",
    },
  },
  "osm-node-13031787241": {
    name: "高梁グリーンパーク",
    prefecture: "岡山県",
    station: "南倉庫前バス停 徒歩約10分",
    categories: ["indoor", "forest"],
    walking: "low",
    tourismUrl: "https://takahashigp.com/pages/outline/index.html",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 34.812752, longitude: 133.594058 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://takahashigp.com/pages/outline/index.html",
      accessEvidenceUrl: "https://takahashigp.com/pages/outline/index.html",
      accessSummary: "南倉庫前バス停から徒歩約10分。駐車場約100台。",
      coolingAttributes: ["indoor", "shade", "forest"],
      seasonalNotes: ["営業日・営業時間は公式のお知らせで確認"],
      reason: "公式施設案内で全天候型施設、アクセス、駐車場を確認済み",
    },
  },
  "osm-node-8809771817": {
    name: "たざわ湖スキー場（グリーンシーズン：ミハラスタザワコ）",
    prefecture: "秋田県",
    station: "田沢湖駅からバス約30分",
    categories: ["highland", "forest"],
    walking: "medium",
    tourismUrl: "https://www.tazawako-ski.com/miharasu/",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 39.762247, longitude: 140.759831 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.tazawako-ski.com/miharasu/",
      accessEvidenceUrl: "https://www.tazawako-ski.com/acc/",
      accessSummary: "田沢湖駅から路線バス約30分。車でもアクセス可能。",
      coolingAttributes: ["highland", "forest", "breeze"],
      seasonalNotes: ["グリーンシーズンの営業日・天候・予約条件を公式で確認"],
      reason: "施設公式サイトで夏季営業、標高のある眺望地、アクセスを確認済み",
    },
  },
  "osm-node-8073015233": {
    name: "暮白の滝",
    prefecture: "長野県",
    station: "無料駐車場（5台）",
    categories: ["water", "highland"],
    walking: "medium",
    tourismUrl: "https://www.vill.achi.lg.jp/soshiki/5/2009-11-post-87.html",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 35.459629, longitude: 137.654351 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.vill.achi.lg.jp/soshiki/5/2009-11-post-87.html",
      accessEvidenceUrl: "https://db.go-nagano.net/themelist/detail/id%3D5024",
      accessSummary: "滝近くの無料駐車場は5台。現地の道路状況に注意。",
      coolingAttributes: ["water", "highland", "forest"],
      seasonalNotes: ["山間部のため天候と道路状況を確認"],
      reason: "村公式ページと県観光情報で実在、滝、アクセスを確認済み",
    },
  },
  "osm-node-4331964093": {
    name: "石垣島鍾乳洞",
    prefecture: "沖縄県",
    station: "施設駐車場",
    categories: ["indoor"],
    walking: "medium",
    tourismUrl: "https://www.ishigaki-cave.com/",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 24.36185, longitude: 124.154342 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.ishigaki-cave.com/",
      accessEvidenceUrl: "https://yaeyama.or.jp/%E7%9F%B3%E5%9E%A3%E5%B3%B6%E9%8D%BE%E4%B9%B3%E6%B4%9E/",
      accessSummary: "石垣市街地から車で訪問でき、施設駐車場あり。",
      coolingAttributes: ["cave", "indoor", "shade"],
      seasonalNotes: ["営業時間・料金を公式で確認", "洞内は段差があり車椅子利用不可"],
      reason: "施設公式と公的観光案内で洞窟、営業時間、アクセスを確認済み",
    },
  },
  "osm-node-9467471831": blocked("水流が失われており、夏の涼しさを提供する親水地点として公開できない"),
  "osm-node-9092915525": blocked("水や木陰などの具体的な涼しさと来訪価値を公式情報で確認できない"),
  "osm-node-2236381513": blocked("米原ヤエヤマヤシ群落は倒木リスクにより2026年7月10日から閉鎖中", ["forest", "shade"], ["再開が公式発表されるまで公開しない"]),
  "osm-node-8229215450": merged("暮白の滝の重複ビューポイント", "osm-node-8073015233"),
  "osm-node-11965914358": blocked("恵水不動への公開された安全な入口とアクセスを確認できない"),
  "osm-node-11965914359": blocked("冷泉堂への公開された安全な入口とアクセスを確認できない"),
  "osm-node-1887919540": blocked("私市円山古墳公園の観光価値は確認できるが、夏の涼しさの根拠が不足"),

  "osm-node-6361414185": {
    name: "夫婦滝",
    prefecture: "熊本県",
    station: "駐車場（3台）",
    categories: ["water", "forest"],
    walking: "medium",
    tourismUrl: "https://www.town.minamioguni.lg.jp/kankou/tanoharu/meoto-daki.html",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 33.084679, longitude: 131.113776 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.town.minamioguni.lg.jp/kankou/tanoharu/meoto-daki.html",
      accessEvidenceUrl: "https://www.welcomekyushu.jp/event/?id=9999900061003&isEvent=&isSpot=1&mode=detail",
      accessSummary: "現地駐車場は3台。道路と足元の状況を確認して訪問。",
      coolingAttributes: ["water", "forest", "shade"],
      seasonalNotes: ["滝周辺は濡れた足元に注意"],
      reason: "町公式と九州観光情報で滝、所在地、アクセスを確認済み",
    },
  },
  "osm-node-5151690010": {
    name: "三景園",
    prefecture: "広島県",
    station: "広島空港 徒歩約5分",
    categories: ["water", "forest"],
    walking: "low",
    tourismUrl: "https://www.chuo-shinrin-koen.or.jp/sankei/sankei.html",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 34.442589, longitude: 132.922269 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.chuo-shinrin-koen.or.jp/sankei/sankei.html",
      accessEvidenceUrl: "https://www.chuo-shinrin-koen.or.jp/sankei/access/access1.html",
      accessSummary: "広島空港から徒歩約5分。空港周辺駐車場を利用。",
      coolingAttributes: ["water", "forest", "shade"],
      seasonalNotes: ["開園時間と休園日を公式で確認"],
      reason: "施設公式で日本庭園、池、森林、空港からのアクセスを確認済み",
    },
  },
  "osm-node-10810976850": {
    name: "道の駅なかとさ",
    prefecture: "高知県",
    station: "土佐久礼駅 徒歩約15分",
    categories: ["indoor", "coast"],
    walking: "low",
    tourismUrl: "https://www.nakatosa.com/michinoekinakatosa/",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 33.322165, longitude: 133.235098 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.nakatosa.com/michinoekinakatosa/",
      accessEvidenceUrl: "https://www.nakatosa.com/access/",
      accessSummary: "土佐久礼駅から徒歩約15分。駐車場あり。",
      coolingAttributes: ["indoor", "breeze"],
      seasonalNotes: ["各店舗の営業時間・定休日を確認"],
      reason: "公式観光サイトで屋内施設、海辺、公共交通と車の入口を確認済み",
    },
  },
  "osm-node-2241643709": {
    name: "鬼ヶ城",
    prefecture: "三重県",
    station: "鬼ヶ城東口バス停",
    categories: ["coast", "water"],
    walking: "medium",
    tourismUrl: "https://www.city.kumano.lg.jp/tourism/?content=269",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 33.890291, longitude: 136.116356 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.city.kumano.lg.jp/tourism/?content=269",
      accessEvidenceUrl: "https://onigajyo.mie.jp/access.html",
      accessSummary: "鬼ヶ城東口バス停または鬼ヶ城センター側駐車場から。",
      coolingAttributes: ["water", "breeze", "shade"],
      seasonalNotes: ["波浪・荒天時は遊歩道の通行情報を市公式で確認"],
      reason: "市公式と施設公式で海岸景勝地、遊歩道、アクセス、安全情報を確認済み",
    },
  },
  "osm-node-12085563269": {
    name: "最上峡芭蕉ライン舟下り 古口港",
    prefecture: "山形県",
    station: "古口駅・古口港",
    categories: ["water", "forest"],
    walking: "low",
    tourismUrl: "https://www.blf.co.jp/about",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 38.738052, longitude: 140.149885 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.blf.co.jp/about",
      accessEvidenceUrl: "https://www.blf.co.jp/dutyfree",
      accessSummary: "古口駅・古口港を入口に利用。駐車場情報は公式案内を確認。",
      coolingAttributes: ["water", "forest", "breeze"],
      seasonalNotes: ["運航コースは水位・天候により変更または欠航あり", "運航時刻と予約条件を確認"],
      reason: "運航会社公式で舟下り、乗船港、運航条件を確認済み",
    },
  },
  "osm-node-2959854421": {
    name: "門司港レトロ展望室",
    prefecture: "福岡県",
    station: "門司港駅 徒歩約13分",
    categories: ["indoor", "coast", "night"],
    walking: "low",
    tourismUrl: "https://mojiko-retoro9.jp/spot/mojiko_retro_observation_room/",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 33.948432, longitude: 130.964143 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://mojiko-retoro9.jp/spot/mojiko_retro_observation_room/",
      accessEvidenceUrl: "https://mojiko-retoro9.jp/spot/mojiko_retro_observation_room/",
      accessSummary: "門司港駅から徒歩約13分。建物内の展望施設。",
      coolingAttributes: ["indoor", "breeze"],
      seasonalNotes: ["営業時間・休館日・入館料を公式で確認"],
      reason: "公式観光サイトで屋内展望施設、営業時間、駅からのアクセスを確認済み",
    },
  },
  "osm-node-8997384014": {
    name: "FUJIYAMAツインテラス",
    prefecture: "山梨県",
    station: "すずらん群生地駐車場から専用シャトル",
    categories: ["highland", "forest"],
    walking: "medium",
    tourismUrl: "https://www.fuefuki-kanko.jp/scontents/fujiyamatwinterrace/index.html",
    elevationM: 1600,
    confidence: "verified",
    routePoint: { latitude: 35.546605, longitude: 138.731834 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.fuefuki-kanko.jp/scontents/fujiyamatwinterrace/index.html",
      accessEvidenceUrl: "https://www.fuefuki-kanko.jp/scontents/fujiyamatwinterrace/index.html",
      accessSummary: "すずらん群生地駐車場から専用シャトルを利用。一般車の乗り入れ条件を確認。",
      coolingAttributes: ["highland", "forest", "breeze"],
      seasonalNotes: ["標高約1,600m", "テラス自体は日陰が少なく天候の影響を受ける", "シャトル運行日を確認"],
      reason: "公式観光サイトで標高、シャトル、営業条件を確認済み",
    },
  },
  "osm-node-3009394900": {
    name: "湯島の大スギ",
    prefecture: "山梨県",
    station: "下湯島バス停",
    categories: ["forest", "highland"],
    walking: "medium",
    tourismUrl: "https://www.town.hayakawa.yamanashi.jp/tour/spot/cultural/cedar01.html",
    elevationM: undefined,
    confidence: "verified",
    routePoint: { latitude: 35.5244, longitude: 138.313784 },
    review: {
      state: "published", reviewedAt,
      officialUrl: "https://www.town.hayakawa.yamanashi.jp/tour/spot/cultural/cedar01.html",
      accessEvidenceUrl: "https://www.town.hayakawa.yamanashi.jp/people/taffic.html",
      accessSummary: "下湯島バス停を入口に訪問。路線バスの本数が少ないため時刻確認必須。",
      coolingAttributes: ["forest", "shade", "highland"],
      seasonalNotes: ["崖沿い・階段あり", "公共交通の便数が限られる"],
      reason: "町公式で巨木、所在地、公共交通の入口を確認済み",
    },
  },
  "osm-node-13871447415": blocked("尾ノ内氷柱は冬季限定で、夏の推薦地点ではない", ["water"], ["冬季イベントのため夏は公開しない"]),
  "osm-node-13240144249": blocked("名勝 吉水園は主に春・秋の限定公開で夏の訪問先にできない"),
  "osm-node-13397738916": blocked("電車見望台は涼しさの根拠がなく、生成属性も実態と一致しない"),
  "osm-node-8997392417": merged("FUJIYAMAツインテラスの重複地点", "osm-node-8997384014"),
} satisfies Record<string, ReviewedDestinationOverride>;

interface ReviewBatchRecord {
  id: string;
  reviewedAt: string;
  officialDetailUrl: string | null;
  accessSummary: string;
  parkingSummary: string;
  accessEvidenceUrls: string[];
  coolingAttributes: LocalCoolingAttribute[];
  coolingScope?: CoolingScope;
  claimLevel?: CoolingClaimLevel;
  thermalEvidence?: DestinationReview["thermalEvidence"];
  coolingEvidenceUrls: string[];
  conditions: string[];
  decision: "publish" | "block";
  reason: string;
  promotion?: Partial<Omit<Destination, "id" | "review" | "confidence">>;
}

const reviewBatch = reviewBatchData.reviews as unknown as ReviewBatchRecord[];

const batchReviewedDestinationOverrides = Object.fromEntries(reviewBatch.map((record) => {
  const evidenceUrls = [
    record.officialDetailUrl,
    ...record.accessEvidenceUrls,
    ...record.coolingEvidenceUrls,
  ].filter((url): url is string => Boolean(url));
  const review: DestinationReview = {
    state: record.decision === "publish" ? "published" : "blocked",
    reviewedAt: record.reviewedAt,
    officialUrl: record.officialDetailUrl ?? undefined,
    accessEvidenceUrl: record.accessEvidenceUrls[0],
    accessSummary: record.accessSummary,
    parkingSummary: record.parkingSummary,
    evidenceUrls: [...new Set(evidenceUrls)],
    coolingAttributes: record.coolingAttributes,
    coolingScope: record.coolingScope,
    claimLevel: record.claimLevel,
    thermalEvidence: record.thermalEvidence,
    seasonalNotes: record.conditions,
    reason: record.reason,
  };

  const override: ReviewedDestinationOverride = record.decision === "publish"
    ? { ...record.promotion, confidence: "verified", review }
    : { confidence: "derived", review };
  return [record.id, override];
}));

const normalizedReviewedDestinationOverrides = Object.fromEntries(normalizedReviewRecords.map((record) => {
  const derivedCategories = record.coolingAttributes.flatMap((attribute) => {
    if (attribute === "water" || attribute === "spring" || attribute === "gorge" || attribute === "lake-breeze") return ["water" as const];
    if (attribute === "forest" || attribute === "shade") return ["forest" as const];
    if (attribute === "highland" || attribute === "snowfield") return ["highland" as const];
    if (attribute === "cave" || attribute === "underground" || attribute === "indoor") return ["indoor" as const];
    if (attribute === "fog" || attribute === "coastal-current") return ["coast" as const];
    if (attribute === "night-cooling") return ["night" as const];
    return [];
  });
  const review: DestinationReview = {
    state: record.state,
    reviewedAt: record.reviewedAt,
    officialUrl: record.officialUrl ?? undefined,
    accessEvidenceUrl: record.accessEvidenceUrl ?? undefined,
    accessSummary: record.accessSummary ?? undefined,
    evidenceUrls: [...new Set([record.officialUrl, record.accessEvidenceUrl].filter((url): url is string => Boolean(url)))],
    coolingAttributes: record.coolingAttributes,
    coolingScope: record.coolingScope,
    claimLevel: record.claimLevel,
    thermalEvidence: record.thermalEvidence,
    seasonalNotes: record.seasonalNotes.length ? record.seasonalNotes : undefined,
    reason: record.reason,
    mergedInto: record.mergedInto ?? undefined,
  };
  const coordinates = record.state === "published" && record.latitude !== null && record.longitude !== null
    ? { latitude: record.latitude, longitude: record.longitude }
    : undefined;
  const override: ReviewedDestinationOverride = record.state === "published"
    ? {
        name: record.name,
        prefecture: record.prefecture,
        tourismUrl: record.officialUrl!,
        ...(derivedCategories.length ? { categories: derivedCategories } : {}),
        elevationM: record.elevationM ?? undefined,
        ...(coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude, routePoint: coordinates } : {}),
        confidence: "verified",
        review,
      }
    : { name: record.name, prefecture: record.prefecture, confidence: "derived", review };
  return [record.id, override];
}));

export const reviewedDestinationOverrides: Record<string, ReviewedDestinationOverride> = {
  ...normalizedReviewedDestinationOverrides,
  ...existingReviewedDestinationOverrides,
  ...batchReviewedDestinationOverrides,
};

export function applyDestinationReview(destination: Destination): Destination {
  const override = (reviewedDestinationOverrides as Record<string, ReviewedDestinationOverride>)[destination.id];
  return override ? { ...destination, ...override, review: withCoolingClaimMetadata(override.review) } : destination;
}

function withCoolingClaimMetadata(review: DestinationReview): DestinationReview {
  const attributes = review.coolingAttributes;
  const coolingScope: CoolingScope = review.coolingScope
    ?? (attributes.includes("spring") ? "water-contact"
      : attributes.some((attribute) => attribute === "cave" || attribute === "underground") ? "enclosed-space"
      : attributes.includes("night-cooling") ? "time-shift"
      : attributes.includes("indoor") ? "indoor-fallback"
      : "local-microclimate");
  return {
    ...review,
    coolingScope,
    claimLevel: review.claimLevel ?? (attributes.length ? "mechanism-verified" : "no-cooling-claim"),
  };
}

export function isPublishedDestination(destination: Destination): boolean {
  return destination.review?.state === "published"
    && destination.confidence === "verified"
    && Boolean(destination.routePoint)
    && !destination.tourismUrl.startsWith("https://www.openstreetmap.org/");
}

function blocked(
  reason: string,
  coolingAttributes: DestinationReview["coolingAttributes"] = [],
  seasonalNotes?: string[],
): ReviewedDestinationOverride {
  return {
    confidence: "derived",
    review: { state: "blocked", reviewedAt, coolingAttributes, seasonalNotes, reason },
  };
}

function merged(reason: string, mergedInto: string): ReviewedDestinationOverride {
  return {
    confidence: "derived",
    review: { state: "merged", reviewedAt, coolingAttributes: [], reason, mergedInto },
  };
}
