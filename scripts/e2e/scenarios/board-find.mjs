// 長い一覧を段階に分けて描くとき、ボードを開いた直後の ⌘F でチャットの名前の検索欄へ移り、探すと合うカードだけが残り、消すと戻る。
import assert from "node:assert/strict";
import { FAKE_CHATS, openLongList, until } from "../longList.mjs";

export default {
  name: "board-find",
  title: "ボードの ⌘F でチャットの名前を探すと、合うカードだけが残り、消すと戻る",
  async setup(ctx) {
    ctx.state.projectId = await openLongList(ctx);
  },
  async act(ctx) {
    ctx.state.result = await ctx.eval(`(async () => {
      const cards = () => [...document.querySelectorAll(".board-main [data-chat-id]")];
      location.hash = "#/projects/${ctx.state.projectId}/board";
      ${until("cards().length >= 10", "ボードの最初のカードが見える")}
      const first = cards().length;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true }));
      const input = document.activeElement;
      const focused = input?.closest?.(".board-search") != null && input.tagName === "INPUT";
      const setValue = (v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setValue("測るチャット 900");
      ${until("cards().length === 1", "探した名前のカードだけが残る")}
      const found = cards().map((c) => c.querySelector(".card-title")?.textContent);
      setValue("");
      input.blur();
      ${until(`cards().length >= ${FAKE_CHATS}`, "検索を消すとカードが戻る")}
      return { first, focused, found, after: cards().length };
    })()`);
  },
  async expect({ state: { result } }) {
    assert.ok(result.first < FAKE_CHATS, `開いた直後はまだ残りのカードを描いていない（${result.first} 枚）`);
    assert.equal(result.focused, true, "⌘F で検索欄にピントが移る");
    assert.deepEqual(result.found, ["測るチャット 900"], "探した名前のカードだけが残る");
    assert.ok(result.after >= FAKE_CHATS, `検索を消すとカードが戻る（${result.after} 枚・開いた直後 ${result.first} 枚）`);
  },
};
