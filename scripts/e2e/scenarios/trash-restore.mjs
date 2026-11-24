// ノート（決まったデータの meeting.md）をゴミ箱に入れると、プロジェクトの「ゴミ箱」タブに行が出て、「元に戻す」で同じ中身のノートに戻り、行が消える
import assert from "node:assert/strict";

const NOTE = "meeting.md";
const ROW = `[...document.querySelectorAll("li")].find((li) => li.textContent.includes(${JSON.stringify(NOTE)}) && [...li.querySelectorAll("button")].some((b) => b.textContent.trim() === "元に戻す"))`;

export default {
  name: "trash-restore",
  title: "ノートをゴミ箱に入れるとゴミ箱のタブに出て、「元に戻す」で元の中身に戻る",
  async setup(ctx) {
    const { alpha } = ctx.fixture.projects;
    ctx.state.original = (await ctx.api("GET", `/api/projects/${alpha}/note?path=${encodeURIComponent(NOTE)}`)).content;
    ctx.state.trashId = (await ctx.api("DELETE", `/api/projects/${alpha}/note?path=${encodeURIComponent(NOTE)}`)).trash_id;
    await ctx.open(`#/projects/${alpha}/trash`);
    await ctx.waitFor(ROW, "ゴミ箱のタブにノートの行が出る");
  },
  async act(ctx) {
    await ctx.eval(`([...(${ROW}).querySelectorAll("button")].find((b) => b.textContent.trim() === "元に戻す").click(), 1)`);
    ctx.state.gone = await ctx.waitFor(`!(${ROW})`, "戻すと行が消える");
  },
  async expect(ctx) {
    const { content } = await ctx.api("GET", `/api/projects/${ctx.fixture.projects.alpha}/note?path=${encodeURIComponent(NOTE)}`);
    assert.ok(ctx.state.trashId, "ゴミ箱の ID が返る");
    assert.equal(ctx.state.gone, true);
    assert.equal(content, ctx.state.original, "同じ場所に同じ中身で戻る");
  },
  async cleanup(ctx) {
    if (ctx.state.trashId === undefined) return;
    const { alpha } = ctx.fixture.projects;
    const notes = await ctx.api("GET", `/api/projects/${alpha}/note?path=${encodeURIComponent(NOTE)}`).catch(() => null);
    if (!notes) await ctx.api("POST", `/api/trash/${ctx.state.trashId}/restore`).catch(() => {});
  },
};
