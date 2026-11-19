// 送信待ちのあるチャット（決まったデータ: 3 件・2 件目のあとに「ここまで」の線・止めてある）で、一覧を開くと 3 件と線が順に出る
import assert from "node:assert/strict";

const OPEN = `[...document.querySelectorAll(".queued-messages button")].find((b) => (b.getAttribute("aria-label") || b.title || "").startsWith("送信待ちの一覧を開く"))`;
const ORDER = `[...document.querySelectorAll(".queued-messages .queued-list > *")].map((e) => e.classList.contains("queued-stop-line") ? "（ここまで）" : e.querySelector(".queued-index")?.textContent + " " + e.querySelector(".queued-text")?.textContent)`;

export default {
  name: "queue-list",
  title: "送信待ちのあるチャットで、3 件と「ここまで」の線が順に出る",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}/chats/${ctx.fixture.chats.queued}`);
    ctx.state.head = await ctx.waitFor(`document.querySelector(".queued-messages .queued-count")?.textContent`, "送信待ちの見出しが出る");
  },
  async act(ctx) {
    await ctx.eval(`(${OPEN}?.click(), 1)`);
    ctx.state.order = await ctx.waitFor(`${ORDER}.length === 4 && ${ORDER}`, "送信待ちの一覧が開く");
  },
  async expect({ state }) {
    assert.equal(state.head, "送信待ち 3 件");
    assert.deepEqual(state.order, ["1 次に一覧の並びを直してください", "2 そのあとテストを足してください", "（ここまで）", "3 最後に説明を書き直してください"]);
  },
};
