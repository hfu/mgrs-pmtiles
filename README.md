# mgrs-pmtiles

MGRS-based Tasking Grid PMTiles.

## 重要な注意

このコードは生成AIに依存して作成したプロトタイプです。
必ずしも人間による責任あるレビューを経ていないため、実運用前に十分な設計・品質・法務レビューを実施してください。

このリポジトリは **パイプベース** で統一しています。
`src/generate-grids.js` が GeoJSON Text Sequence を stdout に流し、tippecanoe が直接受け取ります。

## 現在の方針

- 一時 GeoJSON Text Sequence ファイルは使わない（廃止）
- `node -> tippecanoe` の Unix pipe を標準とする
- Node 側は `MGRS_STDOUT_BLOCKING=1` で stdout を blocking 化し、長大ストリームの欠落を防ぐ
- フィーチャー出力は `fs.writeSync(1, ...)` で 1件ごとの同期書き込み（flush 相当）

## 対応エリア

`MGRS_TARGET` で対象を切り替えます。

- `54t_core`: 54TWN / 54TWP（従来の検証用コア領域）
- `hokkaido_all`: 北海道全域を含む領域

`hokkaido_all` はサンプリングで 100km グリッドを自動発見し、
北海道の島嶼部を取りこぼさないための seed 点も加える構成です。

## ズーム割当

- `mgrs_100km`: minzoom 3 / maxzoom 7
- `mgrs_10km`: minzoom 8 / maxzoom 10
- `mgrs_1km`: minzoom 11 / maxzoom 14
- `mgrs_100m`: minzoom 15 / maxzoom 16

## 依存関係

- **Node.js 18+** (ES modules, MGRS library for coordinate conversion)
- **tippecanoe** (macOS, Homebrew: `brew install tippecanoe`)
- **just** (Justfile task runner, macOS: `brew install just`)

```bash
npm install
```

## 開発環境

このプロジェクトは以下の環境で開発・テストされました：

- **OS**: macOS (Apple Silicon)
- **Node.js**: v18+
- **tippecanoe**: v2.79.0 (Native build via Homebrew)
- **just**: v1.x (Justfile task runner)

Docker ツールチェーンは開発時に検討されましたが、納期内での Unix パイプベースの実装を優先し、削除しました。
本プロジェクトは OS 標準ツール（macOS Homebrew）で完全に動作します。

## 使い方

### 54T コアを生成

```bash
just pmtiles
```

出力:

- `out/mgrs_54T.pmtiles`

### 北海道全域を生成

```bash
just pmtiles-hokkaido
```

出力:

- `out/mgrs_hokkaido.pmtiles`

### JSONL を直接確認

```bash
just generate
```

### タイル統計

```bash
just vt-inspect
```

出力:

- `out/mgrs_54T.vtstats.json`

## テスト

```bash
just test
just test-watch
```

## 配布/公開

Web ビューアは国土地理院（GSI）の最適化ベクトルタイルをベースマップとして使用し、自動的に読み込まれます。

- **GSI 最適化ベクトルタイル** (自動読み込み):
  - スタイル JSON: `https://gsi-cyberjapan.github.io/optimal_bvmap/style/std.json`
- **MGRS Vector Tile** (TileJSON):
  - `https://tunnel.optgeo.org/martin/mgrs-hokkaido`
- **Terrain DEM** (TileJSON):
  - `https://tunnel.optgeo.org/martin/mapterhorn`

生成済み PMTiles は引き続き Hugging Face Datasets にも配置しています。

- Datasets ページ:
  `https://huggingface.co/datasets/smartmaps/mgrs-pmtiles`

## 補足

### Unix パイプベースのアーキテクチャ

- `MGRS_STDOUT_BLOCKING=1` は **Node.js stdout のバッファリング問題を回避する** ために必須です
  - 通常、stdout がパイプに接続されると非ブロッキングになり、長大なデータストリームで欠落が生じる可能性があります
  - このフラグ設定で stdout を明示的にブロッキングモードに切り替えています

- フィーチャー出力は `fs.writeSync(1, ...)` で **1件ごとの同期書き込み（flush 相当）** を行っています
  - JavaScript の通常の `console.log()` ではバッファリングの制御ができないため、低レベルの FileDescriptor 操作を使用しています

### 推奨運用方法

- 大規模生成（`hokkaido_all`）では、先に小規模な `54t_core` で動作確認してから本作業に移行してください
- PMTiles は tippecanoe の並列処理でズームレベルを段階的に生成するため、CPUコア数に応じて処理時間が短縮されます

### パフォーマンス特性

- **Feature 生成**: 単一 Node.js プロセスでシーケンシャル生成
- **PMTiles 作成**: tippecanoe による並列タイル構築（マルチコア利用）
- **メモリ使用**: Unix パイプ経由のストリーミング処理により、バッチファイルI/O に比べメモリ効率が向上
