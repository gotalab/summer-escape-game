import type { Origin } from "./types";

export const origins: Origin[] = [
  { id: "tokyo", name: "東京", prefecture: "東京都", station: "東京駅", latitude: 35.6812, longitude: 139.7671 },
  { id: "shinjuku", name: "新宿", prefecture: "東京都", station: "新宿駅", latitude: 35.6896, longitude: 139.7006 },
  { id: "yokohama", name: "横浜", prefecture: "神奈川県", station: "横浜駅", latitude: 35.4658, longitude: 139.6223 },
  { id: "omiya", name: "大宮", prefecture: "埼玉県", station: "大宮駅", latitude: 35.9063, longitude: 139.6241 },
  { id: "chiba", name: "千葉", prefecture: "千葉県", station: "千葉駅", latitude: 35.6130, longitude: 140.1136 },
  { id: "nagoya", name: "名古屋", prefecture: "愛知県", station: "名古屋駅", latitude: 35.1709, longitude: 136.8815 },
  { id: "osaka", name: "大阪", prefecture: "大阪府", station: "大阪駅", latitude: 34.7025, longitude: 135.4959 },
  { id: "sendai", name: "仙台", prefecture: "宮城県", station: "仙台駅", latitude: 38.2601, longitude: 140.8824 },
  { id: "sapporo", name: "札幌", prefecture: "北海道", station: "札幌駅", latitude: 43.0686, longitude: 141.3508 },
  { id: "fukuoka", name: "博多", prefecture: "福岡県", station: "博多駅", latitude: 33.5898, longitude: 130.4207 },
];

export function getOrigin(id: string): Origin | undefined {
  return origins.find((origin) => origin.id === id);
}
