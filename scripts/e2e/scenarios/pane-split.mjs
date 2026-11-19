// チャットのパネルで、表示中のタブを「右に分ける」→ ほかのタブを右クリックの「ペイン 2 へ移す」→ 右のペインを閉じると、
// ペインの数とタブの並びが期待どおり（閉じたペインのチャットは一覧のペインへ戻り、サイドバーと同じ並びに戻る）
import assert from "node:assert/strict";

/** チャットのパネル（右サイドバー・下のパネル・ノートとファイルのタブの右の欄も .board-panel なので除く） */
const PANEL = ".board-panel:not(.as-sidebar):not(.note-panel):not(.file-panel)";
/** チャットのパネルのペインごとのタブの列（右の欄の入れ子のパネルは除く）。タブの名前は × の名前から（分けたペインのチャットの × は「一覧のペインに戻す」） */
const BARS = `[...document.querySelectorAll("${PANEL} [role=tablist].panel-tabs")].filter((b) => !b.closest(".agent-panel"))`;
const PANES = `${BARS}.map((bar) => [...bar.querySelectorAll("[role=tab]")].map((t) => t.querySelector(".panel-tab-close")?.getAttribute("aria-label")?.replace(/ (のタブを閉じる|を一覧のペインに戻す)$/, "") ?? "?"))`;
const tabNamed = (name) => `[...document.querySelectorAll("${PANEL} [role=tab]")].find((t) => t.querySelector(".panel-tab-close")?.getAttribute("aria-label") === ${JSON.stringify(`${name} のタブを閉じる`)})`;
const LONG = "長いチャット（120 回）";
const MOVED = "固定したチャット";

export default {
  name: "pane-split",
  title: "チャットのタブを右に分け、別のペインへ移し、閉じると、ペインの数とタブの並びが期待どおり",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}/chats/${ctx.fixture.chats.long}`);
    ctx.state.initial = await ctx.waitFor(`${tabNamed(LONG)}?.getAttribute("aria-selected") === "true" && ${PANES}`, "長いチャットのタブが表示中になる");
  },
  async act(ctx) {
    const bar = `${tabNamed(LONG)}.closest("[role=tablist]")`;
    await ctx.eval(`(${bar}.querySelector(".panel-pane-tools button[aria-label='右に分ける']").click(), 1)`);
    ctx.state.split = await ctx.waitFor(`${PANES}.length === 2 && ${PANES}`, "ペインが 2 つになる");
    // 一覧のペインのタブを右クリックし、「ペイン 2 へ移す」
    await ctx.eval(`(() => { const t = ${tabNamed(MOVED)}; const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 })); return 1; })()`);
    await ctx.waitFor(`[...document.querySelectorAll("[role=menuitem]")].some((m) => m.textContent.includes("ペイン 2 へ移す"))`, "タブのメニューが開く");
    await ctx.eval(`([...document.querySelectorAll("[role=menuitem]")].find((m) => m.textContent.includes("ペイン 2 へ移す")).click(), 1)`);
    ctx.state.moved = await ctx.waitFor(`${PANES}[1]?.length === 2 && ${PANES}`, "タブがペイン 2 へ移る");
    // 右のペインを閉じる
    await ctx.eval(`(${BARS}[1].querySelector("button[aria-label='ペインを閉じる']").click(), 1)`);
    ctx.state.closed = await ctx.waitFor(`${PANES}.length === 1 && ${PANES}`, "ペインが 1 つに戻る");
  },
  async expect({ state: { initial, split, moved, closed } }) {
    assert.equal(initial.length, 1, "初めはペイン 1 つ");
    const rest = initial[0].filter((n) => n !== LONG);
    assert.deepEqual(split, [rest, [LONG]], "右に分けると、表示中のタブが右のペインへ移る");
    assert.deepEqual(moved, [rest.filter((n) => n !== MOVED), [LONG, MOVED]], "ペイン 2 へ移すと、右のペインの最後に入る");
    assert.deepEqual(closed, initial, "右のペインを閉じると、チャットは一覧のペインへ戻り、初めと同じ並びになる");
  },
};
