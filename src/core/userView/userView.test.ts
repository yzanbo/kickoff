// 利用者が見ているもの: どのウィンドウを読むか（registry）と、AI に返す文（format）
import assert from "node:assert/strict";
import { test } from "node:test";
import { userViewSummaryOf } from "@shared/chat/aiUserView";
import { USER_VIEW_REPORT_MS, USER_VIEW_TEXT_MAX, type UserView } from "@shared/types";
import { userViewText, type UserViewTextInput } from "./format.js";
import { UserViewRegistry } from "./registry.js";

const editorView: UserView = {
  project_id: 1,
  panes: [
    { area: "チャットのパネル", tab: { kind: "chat", chat_id: 7, title: "実装" } },
    { area: "プロジェクトのファイル", tab: { kind: "editor", path: "src/core/chat/runner.ts", worktree: null, line: 120, selection: { from_line: 120, from_column: 1, to_line: 135, to_column: 4 } } },
  ],
  side: [{ kind: "memo", path: "仕様/a.md", selected_text: "ここ" }],
};
const names = (id: number) => (id === 1 ? "kickoff" : "other");
const input = (patch: Partial<UserViewTextInput>): UserViewTextInput => ({ chatId: 7, projectId: 1, projectName: names, current: null, sent: null, now: 10_000, ...patch });

test("UserViewRegistry: そのチャットを開いているウィンドウを読み、なければ最後に前に出したウィンドウ。古い・閉じたウィンドウは読まない", () => {
  let now = 0;
  const reg = new UserViewRegistry(() => now);
  const other: UserView = { project_id: 2, panes: [], side: [] };
  reg.report({ window_id: "main", view: editorView, chat_ids: [7], focused: false });
  now = 10;
  reg.report({ window_id: "popout", view: other, chat_ids: [8], focused: true });
  assert.deepEqual(reg.currentFor(7)?.view, editorView, "開いているウィンドウ");
  assert.deepEqual(reg.currentFor(9)?.view, other, "開いていなければ最後に前に出したウィンドウ");
  reg.report({ window_id: "popout", view: null, chat_ids: [], focused: false });
  assert.deepEqual(reg.currentFor(9)?.view, editorView);
  now = USER_VIEW_REPORT_MS * 3 + 100;
  assert.equal(reg.currentFor(7), null, "知らせ直しが途絶えたら画面が開いていないとみなす");
  // 送ったときの様子はチャットごとに最後の 1 つ。選んだ文は長ければ切る
  reg.rememberSent(7, { ...editorView, side: [{ kind: "memo", path: "a.md", selected_text: "あ".repeat(USER_VIEW_TEXT_MAX + 5) }] });
  const sent = reg.sentFor(7)?.view.side[0];
  assert.ok(sent?.kind === "memo" && sent.selected_text?.endsWith("…（切りました）"));
});

test("userViewText: 見えているペインごとの前のタブと右の欄、送ったときの様子を返し、1 行目は記録の行の文", () => {
  const text = userViewText(input({ current: { view: editorView, at: 7_000 }, sent: { view: editorView, at: 4_000 } }));
  assert.equal(userViewSummaryOf(text), "画面を見ました（エディタ: runner.ts 120〜135 行を選択中 ほか）");
  assert.match(text, /- チャットのパネル: チャット「実装」（ID 7。このチャット）/);
  assert.match(text, /- プロジェクトのファイル: エディタ: src\/core\/chat\/runner.ts 120〜135 行を選択中（120 行 1 文字目〜135 行 4 文字目）/);
  assert.match(text, /- 右の欄に開いているもの: メモ: 仕様\/a.md/);
  assert.match(text, /3 秒前に知らされた様子/);
  assert.match(text, /最後の発言を送ったとき（6 秒前）の様子:/);
});

test("userViewText: ほかのプロジェクトを見ているときは中身を返さず、プロジェクトの名前と事情、送ったときの様子だけ（Q3）", () => {
  const text = userViewText(input({ current: { view: { project_id: 2, panes: [{ area: "x", tab: { kind: "editor", path: "secret.ts", worktree: null, line: 1, selection: null } }], side: [] }, at: 9_000 }, sent: { view: editorView, at: 5_000 } }));
  assert.equal(userViewSummaryOf(text), "画面を見ようとしましたが、ほかのプロジェクト「other」を見ていたため読めませんでした");
  assert.match(text, /利用者はいま、ほかのプロジェクト「other」を見ています（このチャットはプロジェクト「kickoff」）/);
  assert.doesNotMatch(text, /secret\.ts/);
  assert.match(text, /runner\.ts/, "送ったときの様子（このチャットのプロジェクト）は中身まで");
  assert.match(text, /利用者に聞いてください/);
});

test("userViewText: 画面が開いていない・全プロジェクトの画面でほかのプロジェクトのタブは伏せる", () => {
  const closed = userViewText(input({}));
  assert.equal(userViewSummaryOf(closed), "Kickoff の画面が開いていないため（ウィンドウを閉じている・スマホだけから使っている）、いまの画面は読めません");
  assert.match(closed, /覚えていません/);
  const all: UserView = { project_id: null, panes: [{ area: "チャットのパネル", tab: { kind: "chat", chat_id: 3, title: "よそ", project_id: 2 } }, { area: "下のパネル", tab: { kind: "terminal", label: "kickoff", project_id: 1 } }], side: [] };
  const text = userViewText(input({ current: { view: all, at: 10_000 } }));
  assert.match(text, /全プロジェクトの画面/);
  assert.doesNotMatch(text, /よそ/);
  assert.match(text, /ターミナル: kickoff/);
});
