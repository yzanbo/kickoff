// 文書の検査（scripts/check-docs.mjs）の決まり。上限は文書の役目ごとに決める
// （ルートの CLAUDE.md 8KB・土台 6KB・機能 4KB と祖先と合わせて 20KB・docs/architecture.md 30KB・docs/features.md 60KB・README 10KB）。
// いまの大きさと言葉の数は基準線（scripts/docs-baseline.json）で見逃し、増やさない。
// 上限を一時に緩めるときは scripts/docs-limits.mjs の DOC_LIMITS（{ path | glob, max } の並び）に書く（limits より先に当てる）

import structure, { FEATURES } from "./structure.config.mjs";

export default {
  /** 見る文書（git ls-files に当てる glob） */
  files: ["CLAUDE.md", "**/CLAUDE.md", "docs/**/*.md", "README.md", "mobile/README.md"],
  /** ファイルごとの上限（バイト）。上から最初に合ったものを当てる */
  limits: [
    { glob: "CLAUDE.md", bytes: 8192 },
    { glob: "docs/architecture.md", bytes: 30720 },
    { glob: "docs/features.md", bytes: 61440 },
    { glob: "README.md", bytes: 10240 },
    { glob: "mobile/README.md", bytes: 10240 },
    { glob: "src/foundation/*/CLAUDE.md", bytes: 6144 },
    { glob: "**/CLAUDE.md", bytes: 4096 },
  ],
  /** CLAUDE.md ごとの、自分と祖先のフォルダの CLAUDE.md の合計（自動で読み込まれる量）の上限 */
  ancestorsLimit: 20480,
  /** 1 行の上限（バイト。表の行・コードの囲みの中は数えない） */
  lineLimit: 600,
  /** 文書に書かない言葉（HTML のコメントの中・「docs-ignore: 理由」の行と次の行は見逃す）。「名前は」「手前は」などを経緯にしない */
  forbidden: [
    { pattern: "(?<![名手直午])前は", label: "経緯（前は）" },
    { pattern: "以前は", label: "経緯（以前は）" },
    { pattern: "利用者の依頼", label: "依頼の言葉" },
    { pattern: "\\b20\\d\\d-\\d\\d-\\d\\d\\b", label: "日付" },
    { pattern: "メモの(仕様書|方針)", label: "外の文書の番号" },
  ],
  /**
   * コードのコメントに書かない言葉（「comment-rules-ignore: 理由」の行は見逃す）。コメントは「なぜこの形か」と型で表せない約束を書く。
   * 「前は」は文の頭（行の頭・空白・括弧・句読点のあと）だけを経緯とみなす（「送る前は」「それより前は」は時の条件。comment-rules-ignore: 決まりの言葉を例に書く）。
   * 日付は「〜に直した」の形だけ（書式の例の日付は書いてよい）
   */
  commentForbidden: [
    { pattern: "メモの(仕様書|方針)", label: "外の文書の番号" },
    { pattern: "(?<![^\\s（(、。「])前は|以前は", label: "経緯" },
    { pattern: "\\b20\\d\\d-\\d\\d-\\d\\d ?に", label: "経緯（日付）" },
    { pattern: "利用者の(依頼|指摘)", label: "依頼の言葉" },
    { pattern: "案 ?\\d+|分冊 ?\\d|\\bQ\\d+\\b|開発履歴/", label: "外の文書の番号" },
    { pattern: "eslint-disable", label: "使っていない道具の指示" },
  ],
  /** コメントを見るファイル（テストとテストの補助は除く） */
  commentFiles: ["src/**/*.{ts,tsx}", "mobile/src/**/*.{ts,tsx}", "scripts/**/*.mjs", "*.{ts,mjs}"],
  commentExclude: ["**/*.test.{ts,tsx,mjs}", "**/*.dbtest.ts", "**/testing/**"],
  /** 参照の `@shared/…` などを解く別名（import と同じもの） */
  aliases: structure.aliases,
  /** 置かない CLAUDE.md（中間の層。祖先の CLAUDE.md は毎回読み込まれるため） */
  forbiddenFiles: ["src/features/CLAUDE.md", "src/foundation/CLAUDE.md", "src/shared/CLAUDE.md"],
  /** 受け入れの一覧（ID と確かめ方の形を見る） */
  features: "docs/features.md",
  /** 設計書の機能の表（見出しの下の表の column 列目）の並びが、構造の検査の機能の並びと同じか */
  featureOrder: { file: "docs/architecture.md", heading: "機能の一覧", column: 2, names: FEATURES },
  /** 語彙の表（見出しの下の表の column 列目に ` で囲んで書いた名前が、search のコードにあるか） */
  vocabulary: { file: "docs/architecture.md", heading: "語彙", column: 2, search: ["src", "mobile/src"] },
};
