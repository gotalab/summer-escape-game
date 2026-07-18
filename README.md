# Summer Escape Game

現在地の近くにある実在の避暑先を、6枚の切符から引き当てる短編探索ゲームです。

## Core loop

1. 現在地または選択した出発地から220km圏の候補を構成する
2. 6枚の切符から1枚を引く
3. 逃げ先を確定するか、切符を捨てて引き直す
4. 猛暑前線を引くと候補が1つ消える
5. 最後に場所名、涼しさの根拠、公式情報と経路を確認する

## Data first

- `src/data/generated-destinations.json`: OpenStreetMap由来の全国地点
- `src/data/destinations.ts`: 編集済み観光地点
- `src/data/reviews/` / `src/data/curated-reviews/`: 人間による公開・除外・統合レビュー
- `src/data/japan-weather-cells.json`: 六角形の逃走フィールド用セル
- `src/data/japan-prefectures.json`: 日本地図形状

データ生成・調査スクリプトと確定スナップショットを含み、このリポジトリだけで検証、ビルド、起動できます。

## Deployment target

Cloudflare Workersへデプロイできます。ゲーム本体は外部APIに依存せず、確認済みの地点データだけで動きます。

## Local development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm check
```

## Cloudflare Workers

```bash
pnpm run preview
pnpm run deploy
```

`wrangler.jsonc`とOpenNext設定もこのリポジトリに含まれています。現在の公開先は https://summer-escape-game.gotalab555.workers.dev です。
