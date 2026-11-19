// ⌘K で探す窓が開き、チャットの名前で探して Enter で開く（ハッシュがそのチャットに変わる）
import assert from "node:assert/strict";

const INPUT = `document.querySelector("input[placeholder='プロジェクト・チャット・メモを検索']")`;
const SELECTED = `document.querySelector(".palette-list [role=option][aria-selected=true]")`;

export default {
  name: "palette-open",
  title: "⌘K で探す窓が開き、チャットの名前で探して Enter で開く",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}`);
  },
  async act(ctx) {
    await ctx.press("k", { meta: true });
    ctx.state.focused = await ctx.waitFor(`document.activeElement === ${INPUT}`, "探す欄にピントが来る");
    await ctx.page.send("Input.insertText", { text: "長いチャット" });
    ctx.state.selected = await ctx.waitFor(`${SELECTED}?.textContent.includes("長いチャット（120 回）") && ${SELECTED}.textContent`, "探したチャットが選ばれる");
    await ctx.press("Enter");
    const expected = `#/projects/${ctx.fixture.projects.alpha}/chats/${ctx.fixture.chats.long}`;
    ctx.state.hash = await ctx.waitFor(`location.hash === ${JSON.stringify(expected)} && location.hash`, "Enter でチャットが開く");
    ctx.state.closed = await ctx.waitFor(`!(${INPUT})`, "探す窓が閉じる");
  },
  async expect({ state, fixture }) {
    assert.equal(state.focused, true, "⌘K で探す欄にピントが来る");
    assert.equal(state.hash, `#/projects/${fixture.projects.alpha}/chats/${fixture.chats.long}`, "Enter で探したチャットが開く");
    assert.equal(state.closed, true, "開いたら探す窓が閉じる");
  },
};
