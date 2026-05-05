# LESSONS_LEARNED.md

## プロジェクト反省点と教訓

### 概要

本プロジェクト（MGRS-based PMTiles Generation）は、日本（北海道）全域の軍事グリッド参照システム（MGRS）に基づく Web メルカトル タイルセットの生成を目標としていました。納期超過を避けるため、優先度を明確にして実装を進めた結果、以下の知見が得られました。

---

## Node.js の利点

### 1. 豊富なライブラリエコシステム

**体験**: MGRS 座標変換ライブラリ（mgrs v2.1.0）の即座の活用

- npm で公開されている成熟した MGRS ライブラリが直接使用でき、座標変換ロジックを 0 から実装する手間が完全に削減されました
- 地理情報処理（GIS）分野での Node.js の信頼性が実証されました

**教訓**：
- プロジェクト開始時に十分なライブラリ調査を行うことで、実装期間の大幅短縮が可能
- npm レジストリの検索と評価プロセスは、プロジェクト計画の初期段階で組み込むべき

---

## Node.js の欠点

### 1. stdout バッファリングと Unix パイプの相性問題

**体験**: 大量データ（65M+フィーチャー）を stdout 経由で tippecanoe に流す際、バッファリング制御ができない

#### 問題の詳細：

1. **非ブロッキング stdout**
   - Node.js が stdout をパイプに接続すると、カーネルレベルで自動的に非ブロッキングモードに切り替わる
   - `process.stdout.write()` や `console.log()` は内部バッファを参照するが、バッファサイズの明示的制御ができない
   - 大量データでバッファオーバーフロー時に、出力の欠落が生じる可能性がある

2. **JavaScript 層でのバッファ制御の限界**
   - `stream.pause()` / `stream.resume()` を使用しても、バッファサイズ自体は tunable でない
   - Node.js 内部の `uv_buf_t` や `SO_SNDBUF` への直接アクセスが提供されていない

#### 採用した回避策：

```javascript
// stdout の明示的ブロッキング化
const handle = process.stdout._handle;
if (handle && typeof handle.setBlocking === 'function') {
  handle.setBlocking(true);  // Node.js v5.x+ のみで利用可能
}

// 低レベル FileDescriptor 経由の同期書き込み
import fs from 'node:fs';
fs.writeSync(1, `${jsonFeature}\n`);  // fd:1 = stdout
```

これは：
- Promise ベースの `process.stdout.write()` では構文糖で副作用を隠蔽している
- 仕事の進捗状況をリアルタイムで確認する必要があるため、バッファを明示的にフラッシュする必要がある

**教訓**：
1. **Unix パイプの大流量用には、言語レベルの I/O 制御が必須**
   - Node.js は I/O 関連の API が多層化（Stream, Promise, Callback）しており、それぞれのバッファ動作が異なる
   - 本番パイプラインでは、必ず `process.stdout._handle.setBlocking(true)` を仕込むこと

2. **代替案の検討**
   - 中間ファイルを使用する（I/O は遅いが、制御性が高い）
   - クラスタリング（複数ワーカーで並列化）
   - Go や Rust 等の低レベル言語でパイプドライバーを再実装

---

### 2. テスト環境の複雑化

**体験**: Docker ツールチェーンの構築に時間を費やしたが、結局 macOS Homebrew で十分だった

#### 背景：
- 初期段階で「再現性」を重視し、Docker マルチステージビルド（tippecanoe + vt-optimizer-rs + Node.js）を計画
- ビルド時間（15+ 分）と保守負荷が発生

#### 実際の運用：
- macOS 標準環境（`brew install tippecanoe`）で十分に安定動作
- Docker 環境は使用されないまま終了

**教訓**：
1. **開発初期段階では、過剰な環境管理は避けるべき**
   - 「いつか必要になるかもしれない」環境構築により、スコープクリープが発生しやすい
   - MVP（Minimum Viable Product）段階では、ターゲット環境に直接インストールすることを優先

2. **CI/CD パイプライン化は、運用段階で検討する**
   - 開発チームが単独の場合、複雑な構築システムはむしろ障害になる

---

## MGRS ライブラリの予期しない動作

### 1. inverse() 関数の境界オーバーフロー

**体験**: `mgrs.inverse('54TYM')` が zone 54 の境界（144°E）を超える座標を返す

#### 問題の詳細：

MGRS ライブラリの `inverse()` 関数は、100km セルコードから四隅の lat/lon を計算しますが、返される座標がセルの「名義上」のゾーン境界を超過することがあります：

```javascript
const [west, south, east, north] = mgrs.inverse('54TYM');
// expected: 143.x°E <= east <= 144°E (zone 54 boundary)
// actual:   east can be 144.6°E (exceeds boundary by ~0.6°)
```

このため、隣接ゾーン（54T ↔ 55T）の 100km セルが約 95% 重複する状況が発生していました。

#### 原因分析：

MGRS 標準では、各セル内の座標は「メッシュの中心を基準」に計算される設計です。セルの端では境界オーバーフロー許容が暗黙化されている可能性があります。

#### 採用した対策：

Sutherland-Hodgman ポリゴン クリッピング アルゴリズムを実装し、生成された全ポリゴンを **ゾーン・バンド境界に強制的にクリップ**：

```javascript
export function clipPolygonToZoneBand(polygonCoords, gridPrefix) {
  const bounds = getZoneBandBounds(gridPrefix);
  // 4 辺（西、東、南、北）でのクリッピング処理
  let open = polygonCoords.slice(0, -1);
  open = clipWithVertical(open, bounds.west, false);
  open = clipWithVertical(open, bounds.east, true);
  open = clipWithHorizontal(open, bounds.south, false);
  open = clipWithHorizontal(open, bounds.north, true);
  return open.length < 3 ? null : [...open, open[0]];
}
```

**教訓**：
1. **サードパーティライブラリの「境界値動作」は必ず検証する**
   - 座標変換やジオメトリ処理では、境界付近での動作が予期しないことが多い
   - MGRS/UTM のような標準化されたシステムでも、実装者によってロジックが異なる可能性

2. **テスト駆動で境界ケースを先行実装**
   - `tests/zone-boundary-clipping.test.js` を作成して回帰防止

---

## 計画と納期管理

### 1. スコープ管理の重要性

| 当初計画 | 実装完了 | 削除 |
|---------|---------|------|
| Docker マルチステージビルド | ✗ 実装 | ✓ 削除 |
| vt-optimizer-rs タイル統計 | ✗ 実装 | ✓ 削除 |
| 複数地域対応（関東・関西） | ✓ 実装 | ✓ 北海道に絞定 |

**教訓**：
1. MVP に不可欠な機能を明確にしてから着手
2. 「完璧さより納期」という判断は正当化されるケースが多い

### 2. テストカバレッジの段階的向上

| 段階 | テスト数 | 対象 |
|-----|--------|------|
| 初期 | 28 | MGRS グリッド精度 |
| 中期 | 30 | +ゾーン境界クリッピング |
| 最終 | 86 | +レイヤー設定 + エッジケース + zone/band 定義 |

**教訓**：
- テストは「完成後の品質検証」ではなく、「開発サイクルの反復」として組み込むべき
- 回帰防止テストは、バグ発見時点で即座に追加する（後付けは難しい）

---

## 今後のプロジェクト計画への適用

### Node.js プロジェクトの推奨フロー

1. **計画段階**
   - 主要ライブラリの調査と技術可行性確認（npm search + 実装サンプル作成）
   - I/O パティーンの分類（ストリーミング vs バッチ）
   - 大規模データの場合は stdout バッファリングを先行検証

2. **開発段階**
   - テスト駆動で境界ケースを先行実装
   - 環境管理は最小限に（必要時のみ Docker）
   - Unix パイプ使用時は `setBlocking(true)` と `fs.writeSync()` をデフォルト

3. **納期管理**
   - スコープを明文化し、MVP 完成後に追加検討フェーズを別途計画
   - CI/CD 自動化は、複数チームまたは本番運用段階で検討

---

## 結論

本プロジェクトを通じて、以下が確認されました：

- **Node.js は地理情報処理（GIS）に適している**（ライブラリの豊富さ）
- **しかし大流量パイプラインでは low-level I/O 制御が必須**（バッファリング問題）
- **早期の Docker ツールチェーン化より、シンプルな環境での MVP が優先**（スコープ管理）
- **境界値テストは回帰予防の鍵**（zone boundary clipping、latitude band constraints）

これらの教訓は、類似プロジェクト（データ変換パイプライン、地理情報処理）に直接応用可能です。
