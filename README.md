# Summer Escape Game

猛暑に追いつかれる前に、6枚の切符から次の逃走先を選ぶ短編探索ゲームです。現在地の近くにある、実在する避暑先との偶然の出会いを楽しめます。

## 遊び方

1. 現在地または選択した出発地から220km圏の候補を構成する
2. 6枚の切符から1枚を引く
3. 逃げ先を確定するか、切符を捨てて引き直す
4. 猛暑前線を引くと候補が1つ消える
5. 最後に場所名と涼しさの根拠を知り、Google Mapsや公式情報を開く

ゲームに登場するのは、公開情報から場所、入口、涼しさの根拠を確認できた候補だけです。

## 遊んでみる

[Summer Escape Game](https://summer-escape-game.gotalab555.workers.dev)

## ローカル開発

```bash
pnpm install
pnpm dev
```

## 検証

```bash
pnpm check
```

## Cloudflare Workersへのデプロイ

```bash
pnpm run preview
pnpm run deploy
```

候補生成とゲーム進行は、リポジトリに含まれるデータだけで動作します。`wrangler.jsonc`とOpenNext設定も含まれています。
