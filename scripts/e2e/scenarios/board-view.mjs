// プロジェクトのボードの見え方を「リスト」「ボード」に切り替えると、覚える値（kickoff:board:layout-project）と描いた形（行・カード）が変わる
import assert from "node:assert/strict";

const radio = (name) => `[...document.querySelectorAll("[role=radiogroup][aria-label='表示の切り替え'] [role=radio]")].find((r) => r.textContent.trim() === ${JSON.stringify(name)})`;
const SHAPE = `({ view: JSON.parse(localStorage.getItem("kickoff:board:layout-project") ?? "{}").view ?? null, cards: document.querySelectorAll(".board-main .board-card").length, rows: document.querySelectorAll(".board-main .list-row").length })`;

export default {
  name: "board-view",
  title: "ボードの見え方（ボード・リスト）を切り替えると、保存の値と描いた形が変わる",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}`);
    ctx.state.before = await ctx.waitFor(`document.querySelectorAll(".board-main .board-card").length > 0 && ${radio("リスト")} && ${SHAPE}`, "ボードのカードが出る");
  },
  async act(ctx) {
    await ctx.eval(`(${radio("リスト")}.click(), 1)`);
    ctx.state.list = await ctx.waitFor(`document.querySelectorAll(".board-main .list-row").length > 0 && ${SHAPE}`, "リストの行が出る");
    await ctx.eval(`(${radio("ボード")}.click(), 1)`);
    ctx.state.board = await ctx.waitFor(`document.querySelectorAll(".board-main .board-card").length > 0 && ${SHAPE}`, "ボードのカードに戻る");
  },
  async expect({ state: { before, list, board } }) {
    assert.deepEqual(list, { view: "list", cards: 0, rows: before.cards }, "リストにすると、カードの代わりに同じ数の行を描き、list を覚える");
    assert.deepEqual(board, { view: "board", cards: before.cards, rows: 0 }, "ボードに戻すと、カードを描き、board を覚える");
  },
};
