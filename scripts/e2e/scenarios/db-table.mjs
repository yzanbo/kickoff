// DB のタブで SQLite の接続（決まったデータの sample.sqlite）を開き、表 users を開くと、列と行が出る
import assert from "node:assert/strict";

const CONNECTION = `[...document.querySelectorAll("[role=tree] .db-tree-connection")].find((b) => b.querySelector(".db-tree-label")?.textContent === "サンプル")`;
const TABLE = `[...document.querySelectorAll("[role=tree] .db-tree-object")].find((b) => b.querySelector(".db-tree-label")?.textContent === "users")`;
const GRID = `document.querySelector("[role=grid]")`;

export default {
  name: "db-table",
  title: "DB のタブで SQLite の表を開くと、列と行が出る",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}/db`);
    await ctx.waitFor(CONNECTION, "接続「サンプル」が木に出る");
  },
  async act(ctx) {
    await ctx.eval(`(${CONNECTION}.getAttribute("aria-expanded") === "true" || ${CONNECTION}.click(), 1)`);
    await ctx.waitFor(TABLE, "表 users が木に出る");
    await ctx.eval(`(${TABLE}.click(), 1)`);
    ctx.state.grid = await ctx.waitFor(
      `${GRID}?.querySelectorAll("[role=gridcell]").length >= 9 && {
        columns: [...${GRID}.querySelectorAll("[role=columnheader]")].map((h) => (h.getAttribute("aria-label") || h.title).split("（")[0]),
        rows: [...${GRID}.querySelectorAll("[role=row]")].slice(1).map((r) => [...r.querySelectorAll("[role=gridcell]")].map((c) => c.textContent)),
      }`,
      "表の列と行が出る",
      { timeoutMs: 10000 },
    );
  },
  async expect({ state }) {
    assert.deepEqual(state.grid.columns, ["id", "name", "email"]);
    assert.deepEqual(state.grid.rows.map((r) => r.slice(0, 2)), [["1", "佐藤"], ["2", "鈴木"], ["3", "高橋"]]);
    assert.equal(state.grid.rows[0][2], "sato@example.com");
  },
  async cleanup(ctx) {
    // 開いた接続を閉じる（つないだままだと DB の画面に「つないでいます」が出続ける。最後に使った時刻はコアに残る）
    await ctx.api("POST", `/api/projects/${ctx.fixture.projects.alpha}/db-connections/${ctx.fixture.dbConnections.sample}/disconnect`, { force: true });
  },
};
