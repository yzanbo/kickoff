// プロジェクトの画面の「ターミナルを開く」で下のパネルにターミナルのタブが開き、コアにシェルができる。タブを閉じるとシェルが止まる（コアの一覧から消える）
import assert from "node:assert/strict";

const OPEN = `[...document.querySelectorAll('button[aria-label="ターミナルを開く"]')][0]`;
const CLOSE = (title) => `document.querySelector(${JSON.stringify(`button[aria-label="${title} のタブを閉じる"]`)})`;

/** コアのシェルの一覧が cond を満たすまで待つ（50ms ごと・いちばん長くて 5 秒） */
async function waitTerminals(ctx, cond, label) {
  for (let i = 0; i < 100; i++) {
    const list = await ctx.api("GET", "/api/terminals");
    if (cond(list)) return list;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`5 秒待っても「${label}」になりません`);
}

export default {
  name: "terminal-open",
  title: "ターミナルを開くとタブとシェルができ、タブを閉じるとシェルが止まる",
  async setup(ctx) {
    ctx.state.before = (await ctx.api("GET", "/api/terminals")).map((t) => t.key);
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}`);
    await ctx.waitFor(OPEN, "ターミナルを開くボタンが出る");
  },
  async act(ctx) {
    await ctx.eval(`(${OPEN}.click(), 1)`);
    const list = await waitTerminals(ctx, (l) => l.some((t) => !ctx.state.before.includes(t.key)), "シェルができる");
    ctx.state.opened = list.find((t) => !ctx.state.before.includes(t.key));
    ctx.state.xterm = await ctx.waitFor(`document.querySelector(".xterm-helper-textarea")`, "ターミナルの画面が出る");
    await ctx.waitFor(CLOSE(ctx.state.opened.title), "タブの閉じるボタンが出る");
    await ctx.eval(`(${CLOSE(ctx.state.opened.title)}.click(), 1)`);
    ctx.state.after = await waitTerminals(ctx, (l) => !l.some((t) => t.key === ctx.state.opened.key), "シェルが止まる");
  },
  async expect(ctx) {
    assert.equal(ctx.state.opened.project_id, ctx.fixture.projects.alpha);
    assert.match(ctx.state.opened.cwd, /repos\/alpha$/, "プロジェクトのフォルダで開く");
    assert.equal(ctx.state.xterm, true);
    assert.equal(ctx.state.after.some((t) => t.key === ctx.state.opened.key), false);
  },
  async cleanup(ctx) {
    for (const t of await ctx.api("GET", "/api/terminals")) {
      if (!ctx.state.before?.includes(t.key)) await ctx.api("DELETE", `/api/terminals/${encodeURIComponent(t.key)}`);
    }
  },
};
