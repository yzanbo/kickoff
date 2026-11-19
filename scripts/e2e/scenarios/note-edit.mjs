// ノート（決まったデータの todo.md）を開いて終わりに 1 行書き、⌘S で保存すると、保存の印が「保存済み」に戻り、API で読んだ中身が変わっている。最後に中身を元に戻す
import assert from "node:assert/strict";

const NOTE = "todo.md";
const ADDED = "通しの確かめで足した行";
const STATUS = `document.querySelector("[role=status]")?.textContent`;

export default {
  name: "note-edit",
  title: "ノートを開いて 1 行書き、保存の印が消え、ファイルの中身が変わっている",
  async setup(ctx) {
    const { alpha } = ctx.fixture.projects;
    ctx.state.original = (await ctx.api("GET", `/api/projects/${alpha}/note?path=${encodeURIComponent(NOTE)}`)).content;
    await ctx.open(`#/projects/${alpha}/notes?note=${encodeURIComponent(NOTE)}`);
    await ctx.waitFor(`${STATUS} === "保存済み" && document.querySelector(".cm-content")`, "ノートが開く");
  },
  async act(ctx) {
    await ctx.eval(`(document.querySelector(".cm-content").focus(), 1)`);
    // 文書の終わりへ（⌘↓）移って書く
    await ctx.press("ArrowDown", { meta: true });
    await ctx.page.send("Input.insertText", { text: ADDED });
    ctx.state.dirty = await ctx.waitFor(`${STATUS} !== "保存済み" && ${STATUS}`, "書いたら保存済みでなくなる");
    await ctx.press("s", { meta: true });
    ctx.state.saved = await ctx.waitFor(`${STATUS} === "保存済み"`, "⌘S で保存済みに戻る");
  },
  async expect(ctx) {
    const { content } = await ctx.api("GET", `/api/projects/${ctx.fixture.projects.alpha}/note?path=${encodeURIComponent(NOTE)}`);
    assert.notEqual(ctx.state.dirty, "保存済み");
    assert.equal(ctx.state.saved, true);
    assert.equal(content, ctx.state.original + ADDED, "ファイルの終わりに書いた行が入る");
  },
  async cleanup(ctx) {
    if (ctx.state.original === undefined) return;
    const { alpha } = ctx.fixture.projects;
    const now = await ctx.api("GET", `/api/projects/${alpha}/note?path=${encodeURIComponent(NOTE)}`);
    if (now.content !== ctx.state.original) await ctx.api("PUT", `/api/projects/${alpha}/note`, { path: NOTE, content: ctx.state.original, base_hash: now.hash });
  },
};
