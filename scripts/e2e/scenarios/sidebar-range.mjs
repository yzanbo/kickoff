// 長い一覧を段階に分けて描くとき、最初の行が見えた直後に ⌘ で 1 行目を選び、Shift で 30 行目までを範囲で選べる（30 行が選ばれる）。
import assert from "node:assert/strict";
import { FAKE_CHATS, openLongList, sidebarCheckExpr } from "../longList.mjs";

export default {
  name: "sidebar-range",
  title: "サイドバーの長い一覧で、Shift＋クリックの範囲で選べる",
  async setup(ctx) {
    ctx.state.projectId = await openLongList(ctx);
  },
  async act(ctx) {
    ctx.state.result = await ctx.eval(
      sidebarCheckExpr(
        ctx.state.projectId,
        `rows()[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
        // ⌘ のクリックの描き直しを待つ（人の操作と同じく、次のクリックはそのあと）
        await Promise.resolve();
        rows()[29].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
        await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); });
        const selected = rows().filter((r) => r.classList.contains("multi-selected")).length;
        const rowsAfterShift = rows().length;
        rows()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return { selected, rowsAfterShift };`,
      ),
    );
  },
  async expect({ state: { result } }) {
    assert.ok(result.first < FAKE_CHATS, `開いた直後はまだ残りの行を描いていない（${result.first} 行）`);
    assert.equal(result.selected, 30, "1 行目から 30 行目までが選ばれる");
    assert.ok(result.rowsAfterShift >= FAKE_CHATS, `範囲で選んだあとに行がそろう（${result.rowsAfterShift} 行・開いた直後 ${result.first} 行）`);
  },
};
