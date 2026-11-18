// 構造の検査（scripts/check-structure.mjs）の決まり。いまの構成でもう守れている決まりだけを書く。
// 公開の口・兄弟の循環・window.kickoff・SQL・CSS は、いまの構成では守れていない（書くと違反が何百も基準線に入り、フォルダを移すと鍵が全部変わる）ので、
// 0018 の P2-4 で新しい構成の決まりと一緒に書く

/**
 * @typedef {Object} StructureConfig
 * @property {string[]} files            見るファイル（git ls-files に当てる glob）
 * @property {string[]} tests            テストとして扱うファイルの glob（決まりごとに含めるか選ぶ）
 * @property {Record<string, string>} aliases  import の別名の頭 → リポジトリの中のパスの頭
 * @property {Record<string, string[]>} layers 層の名前 → glob の並び（決まりの from・allow・deny に名前で書く。glob を直に書いてもよい）
 * @property {ImportRule[]} imports      import の向き
 * @property {Object[]} publicApi        公開の口
 * @property {Object[]} siblingCycles    兄弟のフォルダの循環
 * @property {FileSizeRule} fileSize     ファイルの大きさ
 * @property {Object} nativeAccess       window.kickoff を触ってよい場所
 * @property {Object} sqlTables          SQL の表の持ち主
 * @property {Object} cssClasses         CSS のクラスの持ち主
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
 * @typedef {Object} FileSizeRule
 * @property {number} limit              既定の上限（行）
 * @property {{ glob: string, limit: number }[]} rules  上から最初に合ったものを当てる
 * @property {string[]} files            見るファイル
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
};
