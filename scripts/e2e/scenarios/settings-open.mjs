// ⌘, で設定のダイアログが開き、左の項目で節を切り替えられ、Esc で閉じるとピントが開く前の所に戻る
import assert from "node:assert/strict";

/** 開いている設定のダイアログ（左に「設定の項目」がある） */
const DIALOG = `document.querySelector("dialog[open] nav[aria-label='設定の項目']")?.closest("dialog")`;
/** 設定の項目のボタン（名前で） */
const item = (name) => `[...${DIALOG}?.querySelectorAll("nav[aria-label='設定の項目'] button") ?? []].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;

export default {
  name: "settings-open",
  title: "⌘, で設定が開き、節を切り替えられ、Esc で閉じる（ピントが元に戻る）",
  async setup(ctx) {
    await ctx.open(`#/projects/${ctx.fixture.projects.alpha}`);
    // 開く前のピントの置き場所（下の帯の設定のボタン）
    await ctx.waitFor(`document.querySelector(".footer-settings")`, "下の帯の設定のボタンが出る");
    await ctx.eval(`(document.querySelector(".footer-settings").focus(), document.activeElement.classList.contains("footer-settings"))`);
  },
  async act(ctx) {
    await ctx.press(",", { meta: true });
    ctx.state.firstSection = await ctx.waitFor(`${DIALOG} && [...${DIALOG}.querySelectorAll("nav[aria-label='設定の項目'] button[aria-current='true']")].map((b) => b.textContent.trim())[0]`, "設定のダイアログが開く");
    await ctx.eval(`(${item("表示")}.click(), 1)`);
    ctx.state.switched = await ctx.waitFor(`${item("表示")}?.getAttribute("aria-current") === "true" && [...${DIALOG}.querySelectorAll("section h2, section h3")].map((h) => h.textContent.trim()).includes("表示")`, "「表示」の節に切り替わる");
    await ctx.press("Escape");
    ctx.state.closed = await ctx.waitFor(`!(${DIALOG})`, "Esc で設定のダイアログが閉じる");
    ctx.state.focusBack = await ctx.eval(`document.activeElement?.classList.contains("footer-settings") ?? false`);
  },
  async expect({ state }) {
    assert.equal(state.firstSection, "使用状況", "開いたときは「使用状況」の節");
    assert.equal(state.switched, true, "「表示」の節に切り替わる");
    assert.equal(state.closed, true, "Esc で閉じる");
    assert.equal(state.focusBack, true, "閉じるとピントが開く前のボタンに戻る");
  },
};
