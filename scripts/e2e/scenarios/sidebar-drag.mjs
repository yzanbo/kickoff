// 長い一覧を段階に分けて描くとき、ドラッグを始めたら残りの行がそろい、チャットの行をグループへ落とすとそのグループに移る（API の group_id で見る）。
import assert from "node:assert/strict";
import { FAKE_CHATS, openLongList, sidebarCheckExpr, until } from "../longList.mjs";

export default {
  name: "sidebar-drag",
  title: "サイドバーのチャットの行をグループへドラッグすると、そのグループに移る",
  async setup(ctx) {
    ctx.state.projectId = await openLongList(ctx);
    // 動かすのは決まったデータの「送信待ちのあるチャット」（No Group）、落とす先はグループ「調べもの」
    ctx.state.chatId = ctx.fixture.chats.queued;
    ctx.state.groupId = ctx.fixture.groups.research;
    const { chat } = await ctx.api("GET", `/api/chats/${ctx.state.chatId}`);
    assert.equal(chat.group_id, null, "動かす前は No Group");
  },
  async act(ctx) {
    const { chatId } = ctx.state;
    ctx.state.result = await ctx.eval(
      sidebarCheckExpr(
        ctx.state.projectId,
        `const row = rows()[0];
        const box = row.getBoundingClientRect();
        row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: box.left + 10, clientY: box.top + 10 }));
        const rowsDuringDragStart = rows().length;
        ${until(`rows().length >= ${FAKE_CHATS}`, "ドラッグを始めたら残りの行がそろう")}
        const rowsAfterDragStart = rows().length;
        row.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
        // チャットの行をグループ「調べもの」のまとまりへ落とす（ドラッグの印は同じ DataTransfer で渡る）
        const moving = rows().find((r) => r.dataset.chatId === "${chatId}");
        const target = [...document.querySelectorAll(".custom-group")].find((g) => g.querySelector(".custom-group-head")?.textContent.includes("調べもの"));
        const data = new DataTransfer();
        moving.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));
        for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
        moving.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
        return { rowsDuringDragStart, rowsAfterDragStart };`,
      ),
    );
  },
  async expect(ctx) {
    const { result, chatId, groupId } = ctx.state;
    assert.ok(result.first < FAKE_CHATS, `開いた直後はまだ残りの行を描いていない（${result.first} 行）`);
    assert.ok(result.rowsAfterDragStart >= FAKE_CHATS, `ドラッグを始めたら行がそろう（${result.rowsAfterDragStart} 行・開いた直後 ${result.first} 行）`);
    // 落としたあと、API に頼んで答えが返るまで待つ
    let groupOf = null;
    for (let i = 0; i < 50 && groupOf !== groupId; i++) {
      groupOf = (await ctx.api("GET", `/api/chats/${chatId}`)).chat.group_id;
      if (groupOf !== groupId) await ctx.waitFor("true", "次の確かめ");
    }
    assert.equal(groupOf, groupId, "落としたチャットがグループ「調べもの」に移る");
  },
  async cleanup(ctx) {
    await ctx.api("PATCH", `/api/chats/${ctx.state.chatId}`, { group_id: null });
  },
};
