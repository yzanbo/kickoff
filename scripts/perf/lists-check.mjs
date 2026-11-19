// 長い一覧を段階に分けて描いたとき（メモの仕様書「0023_表示を軽くする」の案 23）に、開いた直後のまだ描いていない行にも
// キーでの移動・Shift での範囲の選択・ドラッグ・ボードの ⌘F（チャット名の検索）が効くかを、開発版で確かめる。
// チャットは lists.mjs と同じく画面の fetch を差し替えて足し、終わったら差し替えを外して localStorage を元に戻す。
// node scripts/perf/lists-check.mjs [--count 1000] [--project 21] [--fixture]（--fixture は決まったデータの開発版の ID・ポート）
import { parseArgs } from "node:util";
import { api, connectPage, reload, sleep, withSavedStorage } from "../devtools/cdp.mjs";
import { perfDefaults } from "../devtools/fixture.mjs";
import { shimSource } from "./lists.mjs";

const imports = `const s = await import("/src/lib/storage.ts"); const k = await import("/src/lib/storageKeys.ts"); const f = await import("/src/hooks/useFold.ts");`;
const frame = `await new Promise((r) => requestAnimationFrame(r));`;

/** サイドバーの一覧を閉じてから開き、最初の行が見えた直後（残りを描く前）に check を流す式 */
const sidebarExpr = (projectId, check) => `(async () => {
  ${imports}
  s.writeSetting(k.SIDEBAR_CHAT_SECTIONS, "group");
  f.foldAll("sidebar", true);
  location.hash = "#/projects/${projectId}/memos";
  await new Promise((r) => setTimeout(r, 1000));
  const rows = () => [...document.querySelectorAll('.workspace-page[data-project-id="${projectId}"] a.chat-row[data-chat-id]')];
  // 一覧の中身の高さ（プロジェクトの一覧を開閉する入れ物の中。開く動きの途中でも中身の高さは変わらない）
  const scroller = () => document.querySelector('.workspace-page[data-project-id="${projectId}"] .collapse-inner');
  f.foldAll("sidebar", false);
  // 開く動き（Collapse の open）が始まるまで待つ（閉じている間の行は、キーでの移動・範囲の選択の並びに入らないため）
  const page = document.querySelector('.workspace-page[data-project-id="${projectId}"]');
  for (let i = 0; i < 100 && !(rows().length >= 10 && !page.querySelector(".collapse:not(.open)")); i++) ${frame}
  const first = rows().length;
  const firstHeight = scroller()?.scrollHeight ?? null;
  const result = await (async () => { ${check} })();
  ${frame}
  return { first, firstHeight, after: rows().length, afterHeight: scroller()?.scrollHeight ?? null, ...result };
})()`;

/** 確かめる操作（どれも、最初の行が見えた直後に行う） */
const checks = {
  // ↓: 1 回目で残りの行がそろい、最後から 2 番目の行で ↓ を押すと最後の行へ移る
  key: `
    const list = rows();
    list[0].focus();
    list[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const all = rows();
    const moved = document.activeElement === all[1];
    all.at(-2).focus();
    all.at(-2).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    return { rowsAfterKey: all.length, movedDown: moved, reachedLast: document.activeElement === rows().at(-1) };
  `,
  // ⌘ で 1 行目を選び、Shift で 30 行目までを選ぶ（30 行が選ばれる）。最後に Esc で外す
  shift: `
    const list = rows();
    list[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    // ⌘ のクリックの描き直しを待つ（人の操作と同じく、次のクリックはそのあと）
    await Promise.resolve();
    rows()[29].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
    ${frame}
    const selected = document.querySelectorAll(".workspaces a.chat-row.multi-selected").length;
    const rowsAfterShift = rows().length;
    rows()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { selected, rowsAfterShift };
  `,
  // ドラッグを始めたら（dragstart のあとの setTimeout で）残りの行がそろう。落とさずに終える
  drag: `
    const row = rows()[0];
    const box = row.getBoundingClientRect();
    row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: box.left + 10, clientY: box.top + 10 }));
    const during = rows().length;
    await new Promise((r) => setTimeout(r, 50));
    const rowsAfterDragStart = rows().length;
    row.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
    return { rowsDuringDragStart: during, rowsAfterDragStart };
  `,
};

/** ボードを開いた直後に ⌘F でチャット名の検索欄へ移り、900 番目のチャットの名前を探す */
const boardFindExpr = (projectId) => `(async () => {
  location.hash = "#/projects/${projectId}/memos";
  await new Promise((r) => setTimeout(r, 800));
  const cards = () => [...document.querySelectorAll(".board-main [data-chat-id]")];
  location.hash = "#/projects/${projectId}/board";
  for (let i = 0; i < 200 && cards().length < 10; i++) ${frame}
  const first = cards().length;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true }));
  const input = document.activeElement;
  const focused = input?.closest?.(".board-search") !== null && input?.tagName === "INPUT";
  const setValue = (v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  setValue("測るチャット 900");
  await new Promise((r) => setTimeout(r, 600));
  const searching = cards().length;
  const found = cards().filter((c) => /測るチャット 900(?![0-9])/.test(c.textContent)).length;
  const foundText = cards()[0]?.textContent.slice(0, 60) ?? null;
  setValue("");
  input.blur();
  await new Promise((r) => setTimeout(r, 300));
  return { first, focused, searching, found, foundText, after: cards().length };
})()`;

export async function checkLists({ count = 1000, projectId = 21 } = {}) {
  const template = (await api("GET", `/api/projects/${projectId}/chats`))[0];
  const page = await connectPage();
  const out = {};
  // 確かめている間に画面が出したエラー・警告（React の flushSync の警告など）
  const problems = [];
  const off = page.on((m) => {
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) problems.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    if (m.method === "Runtime.exceptionThrown") problems.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
  });
  try {
    // 確かめ終えたら localStorage とハッシュを元に戻して読み込み直す
    await withSavedStorage(page, async () => {
      let scriptId = null;
      try {
        await page.send("Page.enable");
        await page.send("Runtime.enable");
        ({ identifier: scriptId } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: shimSource({ template, projectId, count, groups: 8 }) }));
        await page.evaluate(`(localStorage.setItem("kickoff:sidebar-waiting-only", "0"), 1)`);
        await reload(page);
        await sleep(1500);
        for (const [name, check] of Object.entries(checks)) {
          out[name] = await page.evaluate(sidebarExpr(projectId, check));
          await sleep(500);
        }
        out.boardFind = await page.evaluate(boardFindExpr(projectId));
        out.problems = problems;
      } finally {
        if (scriptId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId }).catch(() => {});
      }
    });
  } finally {
    off();
    page.close();
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { count: { type: "string", default: "1000" }, project: { type: "string", default: perfDefaults().project }, fixture: { type: "boolean" } } });
  console.log(JSON.stringify(await checkLists({ count: Number(values.count), projectId: Number(values.project) }), null, 1));
}
