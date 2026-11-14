// AI が図を描く前に読む書き方の説明（kickoff_chat の visual_guide の答え）。いつもの指示には「図はツールで描く」だけを書き、
// 細かい書き方は描くときに種類ごとに読ませる（いつもの指示を長くしないため）
import { VISUAL_CDN_ORIGINS, VISUAL_CODE_MAX, VISUAL_THEME_VARS, type VisualGuideTopic } from "@shared/chat/aiVisual";

/** どの種類にも付ける共通の決まり */
const COMMON = [
  "# Kickoff の図の共通の決まり",
  "- show_visual で描いた図は、返答の中（呼んだ位置。文の間）に閉じた枠で出ます。図の前後の文で、何の図かを短く説明してください。",
  "- kind: 構造の図（流れ・順序・状態・関係・ER・ガント）は mermaid、形を自分で決める図・絵は svg、グラフ・画面のラフ・動く部品は html。",
  "- svg は <svg ...> から始め、viewBox を付けて width は書かない（枠の幅に合わせて縮む）。html は <style>・<script> を含む HTML の断片か 1 枚のページ全体。",
  `- 中身は ${VISUAL_CODE_MAX.toLocaleString("en-US")} 文字まで。描き直すときは update_visual に、show_visual が返した visual_id と新しい中身の全体を渡す（差分ではなく全体）。`,
  "- 高さは中身に合わせて枠が決めます。100vh・height: 100% で高さを決めないでください（画面の高さの 8 割を超えると枠の中でスクロール）。",
  "- 色はテーマの変数を使ってください（ダーク・ライトの切り替えにその場で合わせます）。値を決め打ちすると、どちらかのテーマで読めなくなります:",
  `  ${VISUAL_THEME_VARS.join(" ")}`,
  "  例: background: var(--vis-bg); color: var(--vis-text); border: 1px solid var(--vis-border)。SVG の fill / stroke にも var(--vis-...) が使えます。",
  `- 外から読めるのは次の CDN のライブラリだけです: ${VISUAL_CDN_ORIGINS.join(" ")}。ほかへの通信（fetch・画像・フォント）はできません。画像は SVG か data: の URL で中に書いてください。`,
  "- 枠は Kickoff の画面・ファイル・API に触れられません。秘密の値・利用者のデータを図の中に書かないでください。",
];

const DIAGRAM = [
  "# 構造の図（diagram）",
  "- 流れ・順序・状態の移り変わり・テーブルの関係・予定は kind: mermaid で書く（配置は Mermaid が決める）。flowchart / sequenceDiagram / stateDiagram-v2 / erDiagram / gantt / classDiagram / mindmap が使えます。",
  "- Mermaid の色は書かなくてよい（テーマに合わせて描きます）。塗りを付けるなら classDef で fill だけを付け、文字の色は付けない（Kickoff が読める色に直します）。",
  "- 箱の文字は短く（1 行 20 文字ほど）。改行は <br/>。日本語はそのまま書けます。",
  "- Mermaid で配置を決められない図（決まった並びの配置図・地図のような図）は kind: svg で、viewBox の中に座標で描く。文字は font-family: var(--vis-font)、文字が箱からはみ出さないよう幅に余裕を取る。",
];

const CHART = [
  "# グラフ（chart）",
  "- kind: html で、Chart.js（https://cdn.jsdelivr.net/npm/chart.js）などを <script src> で読み、<canvas> に描く。データは <script> の中に書く。",
  "- 色はテーマの変数から取る: getComputedStyle(document.documentElement).getPropertyValue('--vis-chart-1').trim()。文字・線も --vis-text・--vis-muted・--vis-border。",
  "- canvas の親に高さを決める（例: <div style=\"height: 320px\"><canvas></canvas></div>）。Chart.js は maintainAspectRatio: false。",
  "- 少ない点の棒グラフなどは、ライブラリを使わずに kind: svg で描いてもよい（オフラインでも描けます）。",
];

const MOCKUP = [
  "# 画面のラフ（mockup）",
  "- kind: html で、HTML と CSS で組む（SVG で座標を計算するより崩れにくい）。flex / grid で並べ、幅は % か max-width で、狭い枠でも崩れないように。",
  "- 地・文字・線はテーマの変数で。ボタン・入力欄は見た目だけでよい（押しても何も起きなくてよい）。",
  "- 案を並べて比べるときは、案ごとに見出しを付けて縦に並べる。",
];

const INTERACTIVE = [
  "# 動く部品（interactive）",
  "- kind: html の中の <script> で動かせます（タブの切り替え・計算機・絞り込み・並べ替えなど）。",
  "- 図の中のボタンから、このチャットに発言を送れます: sendPrompt('A 案で進めて')。利用者が押したときだけ送られます（読み込んだだけ・タイマーからは送れません）。",
  "- 選んでもらう部品を作ったら、選んだ結果を sendPrompt で送るボタンを置いてください（返答の文でも、何を押せばよいかを書く）。",
  "- localStorage・Cookie・別の窓は使えません。状態は変数に持ってください。",
];

const MATH = [
  "# 数式（math）",
  "- 数式は図のツールを使わず、返答の文の中に書きます（KaTeX で描きます）。",
  "- 段落の数式は $$ … $$（行をまたいでよい）か、行の頭からの \\[ … \\]。文の中の数式は \\( … \\) か $ … $。",
  "- 1 つの $ は、中身が数式らしいときだけ数式になります（値段の $5・シェルの $HOME はそのまま）。迷ったら \\( … \\) を使う。",
  "- コードの中（` ` や ``` ```）の $ は数式になりません。",
];

const TOPICS: Record<VisualGuideTopic, string[]> = { diagram: DIAGRAM, chart: CHART, mockup: MOCKUP, interactive: INTERACTIVE, math: MATH };

/** 書き方の説明（topics の種類ごとの説明と共通の決まり。topics が空なら全部） */
export function visualGuide(topics: readonly VisualGuideTopic[]): string {
  const picked = topics.length > 0 ? [...new Set(topics)] : (Object.keys(TOPICS) as VisualGuideTopic[]);
  return [COMMON.join("\n"), ...picked.map((t) => TOPICS[t].join("\n"))].join("\n\n");
}
