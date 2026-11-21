// 構造の検査（scripts/check-structure.mjs）の決まり。層と依存の向き（ルートの CLAUDE.md）と機能の並び（下の FEATURES）を書く。
// いまある違反は基準線（scripts/structure-baseline.json）に載せ、作り直しの段ごとに減らす。禁じる書き方（patterns）・SQL・CSS の持ち主は、持ち主の段が足す

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
 * @property {SingleUseRule} [singleUse]  1 つの機能だけが読む土台のファイル（警告だけ。基準線に載せない）
 *
 * @typedef {Object} ImportRule
 * @property {string} name               決まりの名前（違反の鍵と、出す文に使う）
 * @property {string[]} from             決まりを当てるファイル（層の名前か glob）
 * @property {string[]} [except]         from のうち決まりを当てないファイル（層か glob）
 * @property {"include"|"exclude"} [tests] テストのファイルを含めるか（既定 include）
 * @property {boolean} [typeOnlyAllowed] 型だけの import は見逃すか（既定 false）
 * @property {boolean} [dynamicAllowed]  動的な import（`import("…")` だけで読む先）は見逃すか（既定 false）
 * @property {string[]} [allow]          読んでよい先（層か glob）。書けば、これ以外のリポジトリの中のファイルは違反
 * @property {string[]} [deny]           読んではいけない先（層か glob）
 * @property {string[]} [allowModules]   読んでよいパッケージ（glob。"node:*" など）。書けば、これ以外のパッケージは違反
 * @property {string[]} [denyModules]    読んではいけないパッケージ
 * @property {boolean} [pureLocal]      読んでよいリポジトリの中のファイルも、パッケージは allowModules のものだけを読むか（既定 false）
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
 * @property {{ call?: string, member?: string, new?: string, args?: number, typeArgs?: string, exportExcept?: string[] }[]} forbid  禁じる呼び出し（"setTimeout"・member "Date.now"・new "Date" と args 0 で引数なしだけ・member "app.get"・exportExcept で並べた名前のほかの export など）
 * @property {string} message
 *
 * @typedef {Object} SingleUseRule
 * @property {string[]} files            見る土台のファイル
 * @property {string[]} [keep]           1 つの機能だけが読んでも土台に残すファイル（理由をコメントに）
 *
 * @typedef {Object} PlacementRule
 * @property {string} name
 * @property {string[]} deny             置いてはいけないファイルの glob
 * @property {string[]} [except]
 * @property {string} message
 */

/** 機能（下の層から。上の機能は下の機能を読んでよく、逆は読めない） */
export const FEATURES = [
  "settings", "panel", "palette", "trash", "projects", "groups", "ai", "chat", "guard", "attachments",
  "composer", "snippets", "compact", "subagents", "childChats", "visuals", "remoteImages", "providerSwitch",
  "workplaceMove", "queue", "userView", "notifications", "conversation", "chatList", "chatPanel", "files",
  "git", "docker", "worktrees", "github", "notes", "database", "terminal", "browser", "ports", "voice",
  "devices", "diagnostics", "sidebar", "board",
];

/** f と、f より下の機能の glob の { } */
const upTo = (f) => `{${FEATURES.slice(0, FEATURES.indexOf(f) + 1).join(",")}}`;
/** だれが読んでもよい純粋な土台（src/shared/types は取り決めの型を束ねる入口で、土台として扱う） */
const SHARED_BASE = ["src/shared/foundation/**", "src/shared/types/**"];
/** 機能 f のコア・画面が読んでよい取り決め（自分と下の機能） */
const sharedUpTo = (f) => [...SHARED_BASE, `src/shared/${upTo(f)}/**`];
/** 機能 f のコアが読んでよい先 */
const coreAllow = (f) => [...sharedUpTo(f), "src/foundation/core/**", `src/features/${upTo(f)}/{core,testing}/**`];
/** 機能 f のコアのテスト（テストは組み立てたコア src/app/core/testing と、自分の別プロセスの中身を読んでよい） */
const coreTests = (f) => [`src/features/${f}/core/**/*.test.{ts,tsx}`, `src/features/${f}/core/**/*.dbtest.ts`, `src/features/${f}/core/**/testing/**`, `src/features/${f}/testing/**`];
const RENDERER = ["src/foundation/ui/**", "src/features/*/ui/**", "src/app/renderer/**"];
/** 拡張点への登録（機能の ui/contributes.ts と、殻がまとめて出すもの） */
const CONTRIBUTES = ["src/features/*/ui/contributes.ts", "src/app/renderer/**/contributes.ts"];

/** AI の実装のフォルダ（ai の core/providers の下。shared は共有の小物） */
const AI_PROVIDER_IMPLS = ["claude", "codex", "copilot", "acp", "cursor", "gemini"];

/** 機能ごとの import の向き（コア・画面・メイン・別プロセス） */
const featureImports = FEATURES.flatMap((f) => [
  { name: `feature-core:${f}`, from: [`src/features/${f}/core/**`, `src/features/${f}/testing/**`], tests: "exclude", allow: coreAllow(f), message: `機能（${f}）のコアは、取り決めと土台のコアと、自分と下の機能のコアだけを読む（上の機能の力は、下が口を宣言して上が登録する）` },
  { name: `feature-core-tests:${f}`, from: coreTests(f), allow: [...coreAllow(f), `src/features/${f}/worker/**`, "src/app/core/testing/**"], message: `機能（${f}）のコアのテストは、コアと同じ先と、組み立てたコア（src/app/core/testing）・自分の別プロセスだけを読む` },
  { name: `feature-ui:${f}`, from: [`src/features/${f}/ui/**`], allow: [...sharedUpTo(f), "src/foundation/ui/**", `src/features/${upTo(f)}/ui/**`], message: `機能（${f}）の画面は、取り決めと土台の画面と、自分と下の機能の画面だけを読む（上の機能の部品は、下が拡張点を宣言して上が登録する）` },
  { name: `feature-desktop:${f}`, from: [`src/features/${f}/desktop/**`], allow: ["src/shared/**", "src/foundation/core/**", "src/foundation/desktop/**", `src/features/${f}/{desktop,core}/**`], message: `機能（${f}）のメインは、取り決め・土台のコアとメイン・自分のメインだけを読む` },
  { name: `feature-desktop-core-types:${f}`, from: [`src/features/${f}/desktop/**`], typeOnlyAllowed: true, deny: [`src/features/${f}/core/**`], message: `機能（${f}）のメインが自分のコアから読むのは型だけ` },
  { name: `ui-storage:${f}`, from: [`src/features/${f}/ui/storage.ts`], allow: ["src/shared/**", "src/foundation/ui/storage/index.ts", `src/features/${f}/ui/*.ts`], allowModules: [], pureLocal: true, message: `保存の宣言（${f} の ui/storage.ts）は、@/foundation/ui/storage・@shared・同じフォルダの純粋な .ts（パッケージ・React を読まない）だけを読む（起動の片付けより前に読むため）` },
  { name: `feature-worker:${f}`, from: [`src/features/${f}/worker/**`], allow: ["src/shared/**", `src/features/${f}/worker/**`], message: `機能（${f}）の別プロセスは、取り決めと自分の別プロセスだけを読む（コアとは取り決めの型だけでつなぐ）` },
]);

/** @type {StructureConfig} */
export default {
  files: ["src/**/*.{ts,tsx,css}", "mobile/src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
  tests: ["**/*.test.{ts,tsx,mjs}", "**/*.dbtest.ts", "**/testing/**", "vitest.setup.ts", "src/foundation/ui/storage/memoryStorage.ts"],
  aliases: { "@shared/": "src/shared/", "@/": "src/" },
  // プロセスの層（コア・メイン・preload・画面・共有）
  layers: {
    core: ["src/foundation/core/**", "src/features/*/core/**", "src/features/*/worker/**", "src/features/*/testing/**", "src/app/core/**"],
    main: ["src/foundation/desktop/**", "src/features/*/desktop/**", "src/app/desktop/**"],
    preload: ["src/foundation/desktop/preload/**", "src/app/desktop/preload.ts"],
    renderer: RENDERER,
    shared: ["src/shared/**"],
  },
  imports: [
    // プロセスの層
    { name: "core-not-renderer", from: ["core"], deny: ["renderer"], message: "コアは画面を読まない（両方で使うものは src/shared へ）" },
    { name: "renderer-not-core", from: ["renderer"], deny: ["core", "main", "preload"], message: "画面はコア・メインを読まない（両方で使うものは src/shared へ）" },
    { name: "shared-pure", from: ["shared"], tests: "exclude", allowModules: [], message: "shared は Node・DOM・npm のパッケージに依らない" },
    { name: "renderer-not-node", from: ["renderer"], tests: "exclude", denyModules: ["node:*"], message: "画面は node: を読まない" },
    { name: "renderer-not-electron", from: ["src/foundation/ui/**", "src/app/renderer/**", ...FEATURES.filter((f) => f !== "browser").map((f) => `src/features/${f}/ui/**`)], tests: "exclude", denyModules: ["electron"], message: "画面は electron を読まない（IPC の型は @shared/foundation/ipc）" },
    { name: "browser-ui-electron-types", from: ["src/features/browser/ui/**"], tests: "exclude", typeOnlyAllowed: true, denyModules: ["electron"], message: "埋め込みブラウザの画面が electron から読むのは型だけ" },
    { name: "preload-narrow", from: ["preload"], tests: "exclude", allow: ["preload", "src/shared/foundation/ipc/**"], allowModules: ["electron"], message: "preload は electron と @shared/foundation/ipc だけを読む" },
    // 共有（純粋な取り決め）
    { name: "shared-foundation", from: SHARED_BASE, allow: SHARED_BASE, message: "shared/foundation は機能の取り決め（shared/<機能>）を読まない" },
    ...FEATURES.map((f) => ({ name: `shared-order:${f}`, from: [`src/shared/${f}/**`], allow: sharedUpTo(f), message: `取り決め（shared/${f}）は、土台と自分と下の機能の取り決めだけを読む` })),
    // 土台（機能の言葉を持たない。機能のものが要るときは、土台が口を宣言し、機能が実装して app が渡す）
    { name: "foundation-core", from: ["src/foundation/core/**"], allow: [...SHARED_BASE, "src/foundation/core/**"], message: "土台のコアは機能と app を読まない" },
    { name: "foundation-ui", from: ["src/foundation/ui/**"], allow: [...SHARED_BASE, "src/foundation/ui/**"], message: "土台の画面は機能と app を読まない" },
    { name: "foundation-desktop", from: ["src/foundation/desktop/**"], allow: [...SHARED_BASE, "src/foundation/core/**", "src/foundation/desktop/**"], message: "土台のメインは機能と app を読まない（コアから読むのは土台だけ）" },
    // 機能
    ...featureImports,
    // AI のつなぎ込み: 外の SDK を読む所を 1 つに閉じ、実装どうしは読まない（ACP の上に作る Cursor・Gemini は acp を読む）
    { name: "ai-claude-sdk", from: ["src/**"], except: ["src/features/ai/core/providers/claude/{wire,run}.ts"], tests: "exclude", denyModules: ["@anthropic-ai/claude-agent-sdk"], message: "Claude Agent SDK を読むのは ai の providers/claude/wire.ts だけ（型・関数は wire から読む）" },
    { name: "ai-copilot-sdk", from: ["src/**"], except: ["src/features/ai/core/providers/copilot/sdk.ts"], tests: "exclude", denyModules: ["@github/copilot-sdk"], message: "GitHub Copilot の SDK を読むのは ai の providers/copilot/sdk.ts だけ" },
    ...AI_PROVIDER_IMPLS.map((impl) => ({
      name: `ai-provider-isolated:${impl}`,
      from: [`src/features/ai/core/providers/${impl}/**`],
      tests: "exclude",
      deny: AI_PROVIDER_IMPLS.filter((other) => other !== impl && !(other === "acp" && ["cursor", "gemini"].includes(impl))).map((other) => `src/features/ai/core/providers/${other}/**`),
      message: `AI の実装（providers/${impl}）はほかの実装を読まない（共有の小物は providers/shared、口は providers/types.ts）`,
    })),
    // 土台の保存の宣言（shell・ui・external の群）
    ...["storage", "hooks", "external"].map((d) => ({ name: `ui-storage:foundation/${d}`, from: [`src/foundation/ui/${d}/storage.ts`], allow: ["src/shared/**", `src/foundation/ui/${d}/*.ts`, "src/foundation/ui/storage/index.ts"], allowModules: [], pureLocal: true, message: "土台の保存の宣言（storage.ts）は、@/foundation/ui/storage・@shared・同じフォルダの純粋な .ts だけを読む" })),
    // 拡張点への登録は組み立ての表だけが読み、登録の表は部品を静的に読まない（起動の片付けのあと・最初の描画の前に読むので軽く保つ）
    { name: "ui-contributes-reader", from: ["renderer"], except: ["src/app/renderer/registry.ts"], tests: "exclude", deny: CONTRIBUTES, message: "contributes.ts を読むのは app/renderer/registry.ts だけ（入れた項目は 点.items() で読む）" },
    { name: "ui-contributes-static", from: CONTRIBUTES, typeOnlyAllowed: true, dynamicAllowed: true, deny: ["**/*.tsx"], allowModules: [], message: "contributes.ts が静的に読むのは型・純粋な関数・拡張点・lazyPart だけ（部品は lazyPart(() => import(\"./X\")) で包む）" },
    // 組み立て（ここだけが全部の機能を知る）とスマホ
    { name: "app-shared", from: ["src/app/shared/**"], allow: ["src/shared/**", "src/app/shared/**"], message: "app/shared は純粋な束ねだけ" },
    { name: "app-core", from: ["src/app/core/**"], allow: ["src/shared/**", "src/foundation/core/**", "src/features/*/{core,testing}/**", "src/app/shared/**", "src/app/core/**"], message: "app/core はコアのプロセスのものだけを読む" },
    { name: "app-desktop", from: ["src/app/desktop/**"], allow: ["src/shared/**", "src/foundation/core/**", "src/foundation/desktop/**", "src/features/*/desktop/**", "src/app/desktop/**"], message: "app/desktop はメインのプロセスのものだけを読む" },
    { name: "app-renderer", from: ["src/app/renderer/**"], allow: ["src/shared/**", "src/foundation/ui/**", "src/features/*/ui/**", "src/app/shared/**", "src/app/renderer/**"], message: "app/renderer は画面のものだけを読む" },
    { name: "mobile-shared-only", from: ["mobile/src/**"], allow: ["src/shared/**", "src/app/shared/**", "mobile/**"], message: "スマホが読んでよいのは src/shared と src/app/shared だけ" },
  ],
  // ほかの機能を読むのは、その機能の core/index.ts・ui/index.ts からだけ（app は全部を知る）
  publicApi: [{ name: "feature-entry", dirs: "src/features/*", entry: ["core/index.ts", "ui/index.ts"], except: ["src/app/**"] }],
  // どの階層でも、兄弟のフォルダどうしは循環させない
  siblingCycles: [{ name: "siblings", parents: ["src", "src/**"] }],
  fileSize: {
    limit: 300,
    rules: [
      { glob: "**/*.test.{ts,tsx,mjs}", limit: 400 },
      // 型・表の宣言だけのファイル
      { glob: "**/{schema,types,contract,events,settings,storage}.ts", limit: 500 },
    ],
    files: ["src/**/*.{ts,tsx,css}", "mobile/src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts}"],
  },
  // window.kickoff（IPC）を直に触ってよいのは、画面の土台と機能の ui/native.ts だけ
  nativeAccess: { files: RENDERER, allow: ["src/foundation/ui/**", "src/features/*/ui/native.ts"] },
  sqlTables: { files: [], owners: {} },
  cssClasses: { files: [], owners: [], free: [] },
  patterns: [
    // 時間に頼る処理は Clock（@/foundation/core/clock）を受ける。テストの時計（manualClock）で進められるように
    {
      name: "core-clock",
      files: ["src/foundation/core/**", "src/features/chat/core/**"],
      allow: ["src/foundation/core/clock.ts", "src/foundation/core/testing/manualClock.ts"],
      forbid: [{ call: "setTimeout" }, { call: "setInterval" }, { member: "Date.now" }, { new: "Date", args: 0 }],
      message: "setTimeout・setInterval・Date.now()・new Date() を直に書かない（Clock を受けて clock.setTimeout・clock.now()・clock.iso() に）",
    },
    // 画面の店は店の家族（createCell・createSignal・createRegistry・createStore）で書く。知らせの受け手の Set を手で持たない
    {
      name: "ui-store-family",
      files: ["renderer"],
      allow: [
        "src/foundation/ui/store/**",
        // まだ乗せ替えていない機能の手書きの店（持ち主の段で乗せ替えて、ここから外す。分冊 04 の P4-1b の表）
        ...["ai/ui/provider/chatProvider.ts", "browser/ui/agentBrowsing.ts", "compact/ui/heldEdit.ts", "database/ui/tabFlags.ts", "files/ui/fileTabs.ts", "files/ui/links/fileIndexStore.ts", "github/ui/githubDialogs.ts", "notes/ui/addToNote.ts", "panel/ui/layout/externalTabDrag.ts", "panel/ui/state/panelStore.ts", "ports/ui/portsStore.ts", "projects/ui/rightSidebar/sideOpenRequests.ts", "projects/ui/rightSidebar/useSideWorktree.ts", "sidebar/ui/ProjectListHead.tsx"].map((f) => `src/features/${f}`),
      ],
      forbid: [{ new: "Set", typeArgs: "() => void" }],
      message: "知らせの受け手の Set を手で持たない（@/foundation/ui/store の createCell・createSignal・createRegistry か、店 createStore を使う）",
    },
    // 保存の宣言のファイルは群 storage だけを出す（起動の片付けが import.meta.glob で storage を集める）
    {
      name: "ui-storage-exports",
      files: ["src/features/*/ui/storage.ts", "src/foundation/ui/*/storage.ts"],
      forbid: [{ exportExcept: ["storage"] }],
      message: "storage.ts は defineSettings の群 storage の 1 つだけを出す（ほかの機能が読むものは ui/index.ts の <機能>Settings、型・解析は同じフォルダの別のファイルへ）",
    },
  ],
  placement: [
    { name: "feature-root-no-code", deny: ["src/features/*/*.{ts,tsx,css}"], message: "機能の直下にコードを置かない（core・ui・desktop・worker の下へ。直下はどの tsconfig にも入らない）" },
    { name: "middle-no-claude-md", deny: ["src/features/CLAUDE.md", "src/foundation/CLAUDE.md", "src/shared/CLAUDE.md"], message: "中間の層に CLAUDE.md を置かない（祖先の CLAUDE.md は毎回読み込まれる）" },
  ],
  // 土台に置くのは 2 つ以上の機能が使うもの。1 つの機能だけが読むなら、その機能へ戻す（警告だけ）
  singleUse: {
    files: ["src/foundation/ui/**"],
    keep: [
      "src/foundation/ui/hooks/useBusyBadge.ts", // 汎用の hook（分冊 04 の 2.10）
      "src/foundation/ui/diff/**", // 差分の土台（git も使うようにするのは分冊 08 の P8-1）
    ],
  },
};
