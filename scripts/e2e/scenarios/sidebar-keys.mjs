// 長い一覧を段階に分けて描くとき、最初の行が見えた直後の ↓ で残りの行がそろい、最後から 2 番目の行で ↓ を押すと最後の行へ移り、最後の行の ↓ で先頭へ回り込む。
import assert from "node:assert/strict";
import { FAKE_CHATS, openLongList, sidebarCheckExpr } from "../longList.mjs";

export default {
  name: "sidebar-keys",
  title: "サイドバーの長い一覧で、まだ描いていない行にも ↓ で移れる",
  async setup(ctx) {
    ctx.state.projectId = await openLongList(ctx);
  },
  async act(ctx) {
    ctx.state.result = await ctx.eval(
      sidebarCheckExpr(
        ctx.state.projectId,
        `const list = rows();
        list[0].focus();
        list[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        const all = rows();
        const movedDown = document.activeElement === all[1];
        all.at(-2).focus();
        all.at(-2).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        const reachedLast = document.activeElement === rows().at(-1);
        all.at(-1).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        return { rowsAfterKey: all.length, movedDown, reachedLast, wrapped: document.activeElement === rows()[0] };`,
      ),
    );
  },
  async expect({ state: { result } }) {
    assert.ok(result.first < FAKE_CHATS, `開いた直後はまだ残りの行を描いていない（${result.first} 行）`);
    assert.ok(result.rowsAfterKey >= FAKE_CHATS, `↓ のあとに行がそろう（${result.rowsAfterKey} 行・開いた直後 ${result.first} 行）`);
    assert.equal(result.movedDown, true, "1 行目で ↓ を押すと 2 行目へ移る");
    assert.equal(result.reachedLast, true, "最後から 2 番目の行で ↓ を押すと最後の行へ移る");
    assert.equal(result.wrapped, true, "最後の行で ↓ を押すと先頭の行へ回り込む");
  },
};
