// 変更のタブでまだコミットしていないファイル（決まったデータの src/util.ts。1 行足してある）を選ぶと、差分が開き、足した行が 1 行出る
import assert from "node:assert/strict";

// 木の行（TreeView の行。名前と変更の種類は title）
const FILE = `[...document.querySelectorAll(".tree-row")].find((row) => row.title === "src/util.ts（変更）")`;

export default {
  name: "open-diff",
  title: "変更のタブでファイルを選ぶと差分が開き、行の数が出る",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}/changes`);
    await ctx.waitFor(FILE, "変更の一覧に src/util.ts が出る");
  },
  async act(ctx) {
    await ctx.eval(`(${FILE}.click(), 1)`);
    ctx.state.diff = await ctx.waitFor(
      `document.querySelector(".monaco-diff-editor .line-insert") && {
        tab: document.querySelector(".panel-tab.active .panel-tab-label")?.textContent,
        inserted: document.querySelectorAll(".monaco-diff-editor .line-insert").length,
        lines: [...document.querySelectorAll(".monaco-diff-editor .view-line")].map((l) => l.textContent.replace(/\\u00a0/g, " ")),
      }`,
      "差分が開く",
      { timeoutMs: 10000 },
    );
  },
  async expect({ state: { diff } }) {
    assert.equal(diff.tab, "util.ts（変更）", "変更のタブが開く");
    assert.equal(diff.inserted, 1, "足した行は 1 行");
    assert.ok(diff.lines.some((l) => l.startsWith("export const twice")), `足した行が出る（${JSON.stringify(diff.lines)}）`);
  },
};
