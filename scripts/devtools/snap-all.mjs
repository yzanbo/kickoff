// 決まったデータの開発版（npm run dev:fixture。CDP 9335）で主な画面を順に記録し、作り直しの前後で比べる。
//
//   node scripts/devtools/snap-all.mjs take <名前> [--only <画面>,<画面>]
//   node scripts/devtools/snap-all.mjs diff <前> <後> [--style] [--limit 40]
//
// 意味の記録（devtools/semantic.mjs）は test-records/ui/<名前>/<画面>.<テーマ>.json（コミットする）、
// スタイルつきの記録と CSS の規則（ui-snapshot.mjs の take・css と同じ形）は .snapshots/<名前>/（コミットしない）。
// 画面ごとに保存を空にしてテーマと画面の設定だけを置き、時計を決まった起点に戻して読み込み直してから、記録が 1 秒変わらなくなるのを待って取る
// （画面の時計は読み込んでから進むので、毎回読み込み直して「n 分前」をそろえる）。終わったら localStorage を元に戻す。
// 記録は npm run fixture:seed で作り直して起動した直後に取る（通しの確かめは DB の接続の最後に使った時刻などをコアに残す）
import fs from "node:fs";
import path from "node:path";
import { cdpPort, connectPage, press, resetPage, sleep, withSavedStorage } from "./cdp.mjs";
import { fixedClockSource } from "./clock.mjs";
import { FIXTURE, readFixture } from "./fixture.mjs";
import { SEMANTIC_JS, diffSemantic, formatSemantic, formatSemanticDiff } from "./semantic.mjs";
import { CSS_RULES_JS, SNAPSHOT_JS, diffRecords } from "../ui-snapshot.mjs";

const RECORDS_DIR = path.resolve("test-records/ui");
const STYLES_DIR = path.resolve(".snapshots");
const THEMES = ["dark", "light"];

/**
 * 記録する画面。hash は fixture.json の ID から作る。keys: 読み込んだあとに押すキー（⌘ つき）。
 * pre: 読み込んだあとに画面で流す文（画面のモジュールは開発の Vite から import する）
 */
export const SCREENS = [
  { name: "all-projects", title: "全プロジェクトのボード", hash: () => "#/" },
  { name: "project-board", title: "プロジェクトのボード", hash: (f) => `#/projects/${f.projects.alpha}` },
  { name: "long-chat", title: "長いチャット", hash: (f) => `#/projects/${f.projects.alpha}/chats/${f.chats.long}` },
  { name: "parent-chat", title: "子チャットのある親チャット", hash: (f) => `#/projects/${f.projects.alpha}/chats/${f.chats.parent}` },
  { name: "queued-chat", title: "送信待ちのあるチャット", hash: (f) => `#/projects/${f.projects.alpha}/chats/${f.chats.queued}` },
  { name: "files", title: "ファイル", hash: (f) => `#/projects/${f.projects.alpha}/files` },
  { name: "changes", title: "変更", hash: (f) => `#/projects/${f.projects.alpha}/changes` },
  { name: "history", title: "履歴", hash: (f) => `#/projects/${f.projects.alpha}/history` },
  { name: "memos", title: "メモ", hash: (f) => `#/projects/${f.projects.alpha}/memos` },
  { name: "db", title: "DB", hash: (f) => `#/projects/${f.projects.alpha}/db` },
  { name: "settings", title: "設定", hash: (f) => `#/projects/${f.projects.alpha}`, keys: [","] },
  { name: "palette", title: "パレット", hash: (f) => `#/projects/${f.projects.alpha}`, keys: ["k"] },
  // 初めて開くとサイドバーのビュー「標準」（グループ別）が当たるので、当たってから（選んだビューを覚えてから）まとめ方だけを作業場所別に替える
  {
    name: "sidebar-worktree",
    title: "サイドバーのまとめ方（作業場所別）",
    hash: (f) => `#/projects/${f.projects.alpha}`,
    pre: `const s = await import("/src/lib/storage.ts"); const k = await import("/src/lib/storageKeys.ts");
      for (let i = 0; i < 100 && !s.readSetting(k.SIDEBAR_VIEW_SELECTED); i++) await new Promise((r) => setTimeout(r, 50));
      s.writeSetting(k.SIDEBAR_CHAT_SECTIONS, "worktree");`,
  },
  { name: "beta-board", title: "git なしのプロジェクト", hash: (f) => `#/projects/${f.projects.beta}` },
];

/** 終わりのある動き（開閉・色の移り変わり）が済むまで待つ式（回り続ける印は待たない。いちばん長くて 3 秒） */
const ANIMATIONS_DONE_JS = `(async () => {
  const running = () => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity);
  for (let i = 0; i < 60 && running().length; i++) await new Promise((r) => setTimeout(r, 50));
  return 1;
})()`;

/** 意味の記録が quietMs の間変わらなくなるまで待って返す（読み込み・段階の描画・動きが終わるのを待つ） */
async function settledSemantic(page, { quietMs = 1000, timeoutMs = 20000 } = {}) {
  const t0 = Date.now();
  let last = null;
  let since = 0;
  while (Date.now() - t0 < timeoutMs) {
    const now = await page.evaluate(SEMANTIC_JS);
    if (now !== last) [last, since] = [now, Date.now()];
    else if (Date.now() - since >= quietMs) return JSON.parse(now);
    await sleep(250);
  }
  throw new Error(`画面が ${timeoutMs / 1000} 秒で落ち着きません（${JSON.parse(last).hash}）`);
}

/** 1 つの画面を 1 つのテーマで開いて記録する */
async function takeScreen(page, screen, theme, fixture, { name }) {
  await resetPage(page, { local: { "kickoff:theme": theme }, hash: screen.hash(fixture), clearSession: true });
  if (screen.pre) await page.evaluate(`(async () => { ${screen.pre} })()`);
  for (const key of screen.keys ?? []) await press(page, key, { meta: true });
  const semantic = await settledSemantic(page);
  const file = `${screen.name}.${theme}`;
  fs.writeFileSync(path.join(RECORDS_DIR, name, `${file}.json`), formatSemantic(semantic));
  // スタイルつきの記録はピントを外し動きを止めるので、意味の記録のあとに取る。開閉の動きの途中の高さを記録しないよう、終わりのある動きが済むのを待つ
  await page.evaluate(ANIMATIONS_DONE_JS);
  fs.writeFileSync(path.join(STYLES_DIR, name, `${file}.json`), await page.evaluate(SNAPSHOT_JS));
  fs.writeFileSync(path.join(STYLES_DIR, name, `${file}.css.json`), await page.evaluate(CSS_RULES_JS));
  console.log(`${file}: ${semantic.count} 物（${semantic.hash}）`);
}

async function take(name, only) {
  if (!name) throw new Error("記録の名前を指定してください");
  const fixture = readFixture();
  const screens = only ? SCREENS.filter((s) => only.includes(s.name)) : SCREENS;
  for (const dir of [RECORDS_DIR, STYLES_DIR]) fs.mkdirSync(path.join(dir, name), { recursive: true });
  const page = await connectPage({ port: cdpPort([...process.argv, "--fixture"]) });
  try {
    await page.send("Page.enable");
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: fixedClockSource(FIXTURE.now) });
    try {
      await withSavedStorage(page, async () => {
        for (const theme of THEMES) for (const screen of screens) await takeScreen(page, screen, theme, fixture, { name });
      });
    } finally {
      await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
    }
  } finally {
    page.close();
  }
}

/** 2 つの記録を画面ごとに比べる（--style ならスタイルつきの記録と CSS の規則も）。違えば終了コード 1 */
function diff(a, b, { style, limit }) {
  if (!a || !b) throw new Error("前と後の記録の名前を指定してください");
  const read = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
  const files = [...new Set([a, b].flatMap((n) => (fs.existsSync(path.join(RECORDS_DIR, n)) ? fs.readdirSync(path.join(RECORDS_DIR, n)) : [])))].sort();
  if (!files.length) throw new Error(`記録がありません: test-records/ui/${a}・${b}`);
  let differ = 0;
  for (const file of files) {
    const [A, B] = [read(path.join(RECORDS_DIR, a, file)), read(path.join(RECORDS_DIR, b, file))];
    if (!A || !B) {
      console.log(`✗ ${file}: ${A ? "後" : "前"}の記録がない`);
      differ++;
      continue;
    }
    const result = diffSemantic(A, B);
    let same = result.same;
    console.log(`${same ? "✓" : "✗"} ${file}`);
    if (!same) console.log(formatSemanticDiff(A, B, result, limit));
    if (style) {
      for (const kind of [".json", ".css.json"]) {
        const styleFile = file.replace(/\.json$/, kind);
        const [SA, SB] = [read(path.join(STYLES_DIR, a, styleFile)), read(path.join(STYLES_DIR, b, styleFile))];
        if (!SA || !SB) console.log(`  スタイルの記録がない: .snapshots/${SA ? b : a}/${styleFile}`);
        else if (!diffRecords(SA, SB, { limit })) same = false;
      }
    }
    if (!same) differ++;
  }
  console.log(differ ? `${files.length} 中 ${differ} の画面が違う` : `${files.length} の画面がすべて同じ`);
  process.exitCode = differ ? 1 : 0;
}

const option = (args, key) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "take") await take(args[0], option(args, "--only")?.split(","));
  else if (command === "diff") diff(args[0], args[1], { style: args.includes("--style"), limit: Number(option(args, "--limit") ?? 40) });
  else {
    console.error("使い方: node scripts/devtools/snap-all.mjs take <名前> [--only <画面>,…] | diff <前> <後> [--style]");
    process.exit(2);
  }
}
