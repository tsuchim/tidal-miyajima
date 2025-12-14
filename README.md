# Miyajima Tide Library (Itsukushima Tide)

宮島・厳島神社大鳥居周辺の潮位を、JavaScriptで計算するための軽量ライブラリです。  
ブラウザ上で動作し、サーバを必要としないため、Webアプリ・展示・観光向けコンテンツなど、さまざまな用途に組み込むことができます。

---

## このライブラリの目的

厳島神社の大鳥居は、**大野瀬戸（おおのせと）**に面した湾内に位置しており、  
潮位によって「歩いて近づける姿」と「海に浮かぶ姿」が大きく変わります。

本ライブラリは、

- 宮島・厳島神社大鳥居周辺の潮位を  
- 教科書ベースの潮汐計算式と調和定数を用いて  
- **JavaScriptのみで計算**し  
- Webサイトやアプリ、展示コンテンツ等に**簡単に組み込める形で提供する**

ことを目的としています。

---

## 背景

本プロジェクトは、**広島県のコンペティションを通じたご縁**をきっかけに着想されました。

当時は諸条件が整わず実装に至りませんでしたが、  
改めて「宮島を技術で盛り上げる」「観光・教育・創作に使える基盤を作る」  
という目的のもと、今回ライブラリとして形にしました。

---

## 特徴

- サーバレス（GitHub Pages 等の静的ホスティングで動作）
- ブラウザ上で完結（計算はすべてクライアント側）
- 教科書に基づく潮汐調和解析モデル
- 宮島（厳島）向けに調整された調和定数を使用
- 商用・非商用を問わず利用可能（MIT License）

---

## 想定用途

- 観光サイトでの「今の鳥居の見え方」表示
- 満潮・干潮に合わせた案内アプリ
- 展示・サイネージ・教育用途
- 個人・研究・商用アプリへの組み込み

---

## 使い方（概要）

```js
import { MiyajimaTide } from "./tide-lib.js";

const tide = new MiyajimaTide();
const heightCm = tide.heightCmAt(new Date());

console.log(heightCm);```

---

## デモ

[宮島潮位計算アプリ](https://tsuchim.github.io/tidal-miyajima/) で、リアルタイムで潮位を確認できます。

---

## インストール

### ブラウザでの使用

```html
<script type="module">
  import { MiyajimaTide } from "https://raw.githubusercontent.com/tsuchim/tidal-miyajima/main/tide-lib.js";
  
  const tide = new MiyajimaTide();
  const height = tide.heightCmAt(new Date());
  console.log(`潮位: ${height.toFixed(1)} cm`);
</script>
```

### ローカルでの使用

```bash
git clone https://github.com/tsuchim/tidal-miyajima.git
cd tidal-miyajima
```

その後、`index.html` をブラウザで開くか、ローカルサーバで実行してください。

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server
```

---

## API リファレンス

### `MiyajimaTide` クラス

#### コンストラクタ

```js
const tide = new MiyajimaTide(params);
```

- `params` (optional): 調和定数パラメータオブジェクト（デフォルト: 厳島の定数）

#### メソッド

##### `heightCmAt(date: Date): number`

指定の日時における潮位を計算します。

```js
const height = tide.heightCmAt(new Date());
console.log(height); // cm単位の潮位
```

##### `seriesCm(startDate: Date, minutes: number, stepMinutes?: number): Array`

指定の期間の潮位系列を計算します。

```js
const series = tide.seriesCm(new Date(), 24 * 60, 10);
// 今から24時間、10分刻みで潮位を計算
series.forEach(p => {
  console.log(`${p.t.toLocaleString()}: ${p.cm.toFixed(1)} cm`);
});
```

---

## 技術詳細

このライブラリは、以下の教科書に基づいています：

- **調和解析の基礎**: 潮汐の合成式 η(t) = Z0 + Σ f_i H_i cos([V_i+u_i]-κ_i)
- **天文引数の近似式**: s, h, p, N の計算（式(27)-(30)）
- **時間変化**: T, s, h, p の時間進行式
- **節補正係数**: f, u の計算（第2表より）

**調和定数（厳島・Itsukushima）**

| 分潮 | H (cm) | κ (°) | 説明 |
|------|--------|-------|------|
| O1   | 24.0   | 201.0 | 主太陰日周潮 |
| P1   | 10.3   | 219.0 | 主太陽日周潮 |
| K1   | 31.0   | 219.0 | 日月合成日周潮 |
| M2   | 103.0  | 277.0 | 主太陰半日周潮 |
| S2   | 40.0   | 310.0 | 主太陽半日周潮 |
| K2   | 10.9   | 310.0 | 日月合成半日潮 |

---

## ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。

商用・非商用を問わず、自由に使用、修正、配布が可能です。

---

## 貢献

バグ報告、機能提案、プルリクエストなどは、[GitHub Issues](https://github.com/tsuchim/tidal-miyajima/issues) でお受けしています。

---

## 著者

- tsuchim

---

## 参考資料

- 潮汐調和解析に関する教科書・論文
- 国土地理院の調査データ
- 厳島神社周辺の海洋観測データ