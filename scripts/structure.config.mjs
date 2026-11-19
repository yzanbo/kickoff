// 構造の検査（scripts/check-structure.mjs）の決まり。いまの構成でもう守れている決まりだけを書く。
// 公開の口・兄弟の循環・window.kickoff・SQL・CSS は、いまの構成では守れていない（書くと違反が何百も基準線に入り、フォルダを移すと鍵が全部変わる）ので、
// 新しい構成に移すときに、その決まりと一緒に書く。禁じる書き方（patterns）・置かないファイル（placement）は、持ち主の段が足す

/**
 * @typedef {Object} StructureConfig
 * @property {string[]} files            見るファイル（git ls-files に当てる glob）
 * @property {string[]} tests            テストとして扱うファイルの glob（決まりごとに含めるか選ぶ）
 * @property {Record<string, string>} aliases  import の別名の頭 → リポジトリの中のパスの頭
 * @property {Record<string, string[]>} layers 層の名前 → glob の並び（決まりの from・allow・deny に名前で書く。glob を直に書いてもよい）
 * @property {ImportRule[]} imports      import の向き
 * @property {PublicApiRule[]} publicApi 公開の口
 * @property {CycleRule[]} siblingCycles 兄弟のフォルダの循環
 * @property {FileSizeRule} fileSize     ファイルの大きさ
 * @property {NativeRule} nativeAccess   window.kickoff を触ってよい場所
 * @property {SqlRule} sqlTables         SQL の表の持ち主
 * @property {CssRule} cssClasses        CSS のクラスの持ち主
 * @property {PatternRule[]} patterns     禁じる書き方
 * @property {PlacementRule[]} placement  置かないファイル
 *
 * @typedef {Object} ImportRule
 * @property {string} name               決まりの名前（違反の鍵と、出す文に使う）
 * @property {string[]} from             決まりを当てるファイル（層の名前か glob）
 * @property {"include"|"exclude"} [tests] テストのファイルを含めるか（既定 include）
 * @property {boolean} [typeOnlyAllowed] 型だけの import は見逃すか（既定 false）
 * @property {string[]} [allow]          読んでよい先（層か glob）。書けば、これ以外のリポジトリの中のファイルは違反
 * @property {string[]} [deny]           読んではいけない先（層か glob）
 * @property {string[]} [allowModules]   読んでよいパッケージ（glob。"node:*" など）。書けば、これ以外のパッケージは違反
 * @property {string[]} [denyModules]    読んではいけないパッケージ
 * @property {string} message            違反のときに出す、代わりにどう書くか
 *
 * @typedef {Object} PublicApiRule
 * @property {string} name
 * @property {string} dirs               口を持つフォルダの glob（例 "src/features/*\/core"。* が 1 つの機能に当たる）
 * @property {string[]} entry            外から読んでよいファイル（dirs からの相対。例 ["index.ts"]）
 * @property {string[]} [except]         決まりを当てない読み手（glob。例 app）
 *
 * @typedef {Object} CycleRule
 * @property {string} name
 * @property {string[]} parents          直下のフォルダどうしの循環を見るフォルダ（glob 可。例 "src/features/*\/ui"）
 * @property {"include"|"exclude"} [tests]
 *
 * @typedef {Object} FileSizeRule
 * @property {number} limit              既定の上限（行）
 * @property {{ glob: string, limit: number }[]} rules  上から最初に合ったものを当てる
 * @property {string[]} files            見るファイル
 *
 * @typedef {Object} NativeRule
 * @property {string[]} files            見るファイル（例 画面の全部）
 * @property {string[]} allow            window.kickoff・globalThis.kickoff を書いてよいファイル
 * @property {"include"|"exclude"} [tests] テストのファイルを含めるか（既定 include）
 *
 * @typedef {Object} SqlRule
 * @property {string[]} files            見るファイル（コア）
 * @property {Record<string, string[]>} owners  表の名前 → 書いて・読んでよいファイルの glob
 * @property {string[]} [ignoreNames]    表として扱わない名前（トリガーの名前など）
 * @property {"include"|"exclude"} [tests] テストのファイルを含めるか（既定 include）
 *
 * @typedef {Object} CssRule
 * @property {string[]} files            見る CSS
 * @property {{ prefix: string, owner: string[] }[]} owners  クラスの頭 → そのクラスを書いてよい CSS の glob（いちばん長い頭を当てる）
 * @property {string[]} free             どの頭の持ち主でもないクラスを書いてよい CSS（土台の共通の型）
 *
 * @typedef {Object} PatternRule
 * @property {string} name
 * @property {string[]} files            見るファイル（層か glob）
 * @property {string[]} [allow]          決まりを当てないファイル（その口の実装など）
 * @property {"include"|"exclude"} [tests] 既定 exclude
 * @property {{ call?: string, member?: string, new?: string, args?: number }[]} forbid  禁じる呼び出し（"setTimeout"・member "Date.now"・new "Date" と args 0 で引数なしだけ・member "app.get" など）
 * @property {string} message
 *
 * @typedef {Object} PlacementRule
 * @property {string} name
 * @property {string[]} deny             置いてはいけないファイルの glob
 * @property {string[]} [except]
 * @property {string} message
 */

/** @type {StructureConfig} */
export default {
  files: ["src/**/*.{ts,tsx,css}", "mobile/src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
  tests: ["**/*.test.{ts,tsx,mjs}", "**/*.dbtest.ts", "**/testing/**", "vitest.setup.ts", "src/renderer/src/lib/memoryStorage.ts"],
  aliases: { "@shared/": "src/shared/", "@/": "src/renderer/src/" },
  layers: {
    core: ["src/core/**"],
    main: ["src/main/**"],
    preload: ["src/preload/**"],
    renderer: ["src/renderer/**"],
    rendererBase: ["src/renderer/src/ui/**", "src/renderer/src/hooks/**", "src/renderer/src/lib/**", "src/renderer/src/stores/**", "src/renderer/src/api/**"],
    rendererUpper: ["src/renderer/src/features/**", "src/renderer/src/app/**"],
    shared: ["src/shared/**"],
  },
  imports: [
    { name: "core-not-renderer", from: ["core"], deny: ["renderer"], message: "コアは画面を読まない（両方で使うものは src/shared へ）" },
    { name: "renderer-not-core", from: ["renderer"], deny: ["core", "main", "preload"], message: "画面はコア・メインを読まない（両方で使うものは src/shared へ）" },
    { name: "base-not-features", from: ["rendererBase"], deny: ["rendererUpper"], message: "ui・hooks・lib・stores・api は features・app を読まない" },
    { name: "shared-pure", from: ["shared"], tests: "exclude", allow: ["shared"], allowModules: [], message: "shared は shared だけを読む（Node・DOM・npm のパッケージに依らない）" },
    { name: "renderer-not-node", from: ["renderer"], tests: "exclude", denyModules: ["node:*"], message: "画面は node: を読まない" },
    { name: "preload-narrow", from: ["preload"], tests: "exclude", allow: ["preload", "src/shared/ipc/**"], allowModules: ["electron"], message: "preload は electron と @shared/ipc だけを読む" },
  ],
  publicApi: [],
  siblingCycles: [],
  fileSize: {
    limit: 300,
    rules: [
      { glob: "src/shared/types/**", limit: 500 },
      { glob: "**/*.test.{ts,tsx,mjs}", limit: 400 },
    ],
    files: ["src/**/*.{ts,tsx,css}", "mobile/src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
  },
  nativeAccess: { files: [], allow: [] },
  sqlTables: { files: [], owners: {} },
  cssClasses: { files: [], owners: [], free: [] },
  patterns: [],
  placement: [],
};
