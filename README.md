# Summer Escape Game

実在する日本全国の場所を使い、3回の二択で自分の「夏の抜け道」3島を発見する短編探索ゲームです。

## Core loop

1. 全国の地点から、そのプレイ用の32島を構成する
2. 二択を選ぶたびに反対側の島が沈む
3. 3回の選択で候補を絞り、最終3島をRevealする
4. 最後に場所名、涼しさの根拠、公式情報をRevealする

32は表示上の上限ではなく、1プレイのゲームデッキです。質問は意味を保つため常に完全な半分にはならず、32島の余裕を持たせて最後に3島をRevealします。地図の背景世界には全地点を残します。

## Data first

- `src/data/raw/generated-destinations.json`: OpenStreetMap由来の全国2,216地点
- `src/data/raw/curated-destinations.ts`: 編集済み観光地点113件
- `src/data/raw/reviewed-*.json`: 人間による公開・除外・統合レビュー
- `src/data/japan-weather-cells.json`: 気温モザイク用セル
- `src/data/japan-prefectures.json`: 日本地図形状

データ生成・調査スクリプトと確定スナップショットを含み、このリポジトリだけで検証、ビルド、起動できます。

## Deployment target

最終ターゲットはCloudflare Workersです。外部APIに依存しないゲーム本体を先に完成させ、その後に天気やAIナレーションを追加します。

## Local development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm check
pnpm test:e2e
```

## Cloudflare Workers

```bash
pnpm preview
pnpm deploy
```

`wrangler.jsonc`とOpenNext設定もこのリポジトリに含まれています。
