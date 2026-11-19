// 長い一覧の通しの確かめ（sidebar-*・board-find）が共通に使う準備: 画面の fetch を差し替えて偽のチャット 1,000・グループ 8 を足し、
// サイドバーの一覧・ボードを開いた直後（残りの行を描く前）に操作する（段階に分けて描く決まり。画面の CLAUDE.md の「性能」）

import { shimSource } from "../devtools/listShim.mjs";

/** 足す偽のチャットの数 */
export const FAKE_CHATS = 1000;

/** 画面の中で、条件が真になるまで待つ文（rAF ごと・50ms ごと。5 秒で投げる） */
export const until = (cond, label) =>
  `await (async () => { const t0 = performance.now(); while (!(${cond})) { if (performance.now() - t0 > 5000) throw new Error(${JSON.stringify(`5 秒待っても「${label}」になりません`)}); await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); }); } })();`;

/** 偽のチャットを足す差し替えを入れ、プロジェクト alpha のメモの画面を開く（プロジェクトの ID を返す） */
export async function openLongList(ctx) {
  const projectId = ctx.fixture.projects.alpha;
  const template = (await ctx.api("GET", `/api/projects/${projectId}/chats`))[0];
  await ctx.addScript(shimSource({ template, projectId, count: FAKE_CHATS, groups: 8 }));
  await ctx.open(`#/projects/${projectId}/memos`);
  // 偽のチャットが一覧に届いて描き終わるまで待つ（届く前に閉じて開くと、届いたときに描き始めになり、開いた直後をつかまえられない）
  await ctx.waitFor(`${sidebarRows(projectId)}.length >= ${FAKE_CHATS}`, "偽のチャットがサイドバーに並ぶ", { timeoutMs: 15000 });
  return projectId;
}

/** サイドバーのプロジェクトの行（偽のチャットを含む）を返す式 */
export const sidebarRows = (projectId) => `[...document.querySelectorAll('.workspace-page[data-project-id="${projectId}"] a.chat-row[data-chat-id]')]`;

/**
 * サイドバーのプロジェクトの一覧をグループ別にして閉じてから開き、最初の行が見えた直後（残りを描く前）に check を流す式。
 * check の中では rows() で行を読める。{ first（開いた直後の行の数）, after（終わったときの行の数）, …check の結果 } を返す
 */
export const sidebarCheckExpr = (projectId, check) => `(async () => {
  const s = await import("/src/lib/storage.ts");
  const k = await import("/src/lib/storageKeys.ts");
  const f = await import("/src/hooks/useFold.ts");
  const rows = () => ${sidebarRows(projectId)};
  // 初めて開いたときに当たるビュー「標準」が当たってから、要対応をオフにする（偽のチャットがすべてプロジェクトの一覧に並ぶように）
  ${until("s.readSetting(k.SIDEBAR_VIEW_SELECTED)", "サイドバーのビューが当たる")}
  s.writeSetting(k.SIDEBAR_WAITING_ONLY, false);
  s.writeSetting(k.SIDEBAR_CHAT_SECTIONS, "group");
  f.foldAll("sidebar", true);
  ${until("rows().length === 0", "サイドバーの一覧が閉じる")}
  // 閉じた見え方を描き終えたと画面が覚えるまで（描いたあとの rAF 2 回と transition）待つ。覚える前に開くと、
  // 前に開いていた見え方を描き終えたままとみなされ、残りまで一度に描く（hooks/useProgressiveRows.ts の useProgressivePage）
  for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 1000); });
  f.foldAll("sidebar", false);
  const page = document.querySelector('.workspace-page[data-project-id="${projectId}"]');
  // 開く動き（Collapse の open）が始まるまで待つ（閉じている間の行は、キーでの移動・範囲の選択の並びに入らないため）
  ${until(`rows().length >= 10 && ![...page.querySelectorAll(".collapse:not(.open)")].some((c) => c.querySelector("a.chat-row"))`, "最初の行が見える")}
  // 描いたあとの effect（残りを描く予約）が流れるまで、1 フレームとタスクを 1 つ譲る（予約の前に操作すると、残りをすぐ描く ensureAllRows が
  // 空振りする。人が押せるのは描かれたものを見たあとなので、そこにそろえる。残りを描くのは予約から 2 フレームあとの割り込める作業）
  await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); });
  await new Promise((r) => setTimeout(r, 0));
  const first = rows().length;
  const result = await (async () => { ${check} })();
  return { first, after: rows().length, ...result };
})()`;
