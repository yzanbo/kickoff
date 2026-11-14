// チャットの AI が返答の中に描く図のツールの中身（図の ID を返す・描き直すのは同じチャットの図だけ・書き方の説明）
import assert from "node:assert/strict";
import { test } from "node:test";
import { collectVisuals, visualIdOf } from "@shared/chat/aiVisual";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore } from "../testing/testCore.js";
import { createAiVisualTools } from "./aiVisual.js";

function setup() {
  const ctx = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s", turns: 1, result: "" })));
  const base = { project_id: ctx.project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, parent_chat_id: null, memo_path: null };
  const chat = ctx.store.chats.create({ ...base, title: "図" });
  const other = ctx.store.chats.create({ ...base, title: "ほか" });
  return { ...ctx, chat, other, tools: createAiVisualTools(ctx.store, chat.id), otherTools: createAiVisualTools(ctx.store, other.id) };
}

/** ツールの呼び出しと結果を記録に残す（プロバイダーが残すのと同じ形） */
function record(ctx: ReturnType<typeof setup>, chatId: number, id: string, name: string, input: Record<string, unknown>, result: string) {
  ctx.store.events.add(chatId, { type: "tool_use", id, name: `mcp__kickoff_chat__${name}`, input });
  ctx.store.events.add(chatId, { type: "tool_result", tool_use_id: id, content: result, is_error: false });
}

test("show_visual: 図の ID を返し、空・長すぎる中身・知らない種類は断る", () => {
  const ctx = setup();
  const shown = ctx.tools.show({ kind: "svg", code: "<svg viewBox='0 0 10 10'></svg>", title: "構成" });
  assert.match(shown, /「構成」を返答のこの位置に描きました/);
  assert.match(visualIdOf(shown) ?? "", /^v-[a-z0-9]{8}$/);
  assert.notEqual(visualIdOf(ctx.tools.show({ kind: "mermaid", code: "flowchart LR\nA-->B" })), visualIdOf(shown));
  assert.throws(() => ctx.tools.show({ kind: "svg", code: "  " }), /code が空です/);
  assert.throws(() => ctx.tools.show({ kind: "svg", code: "x".repeat(200_001) }), /長すぎます/);
  assert.throws(() => ctx.tools.show({ kind: "png" as never, code: "x" }), /kind は svg \/ html \/ mermaid/);
});

test("update_visual: このチャットで描いた図だけを描き直す（ほかのチャットの図・知らない ID は断る）", () => {
  const ctx = setup();
  const result = ctx.tools.show({ kind: "html", code: "<p>1</p>", title: "表" });
  const id = visualIdOf(result)!;
  // 描いた結果が記録に残ってから描き直せる
  assert.throws(() => ctx.tools.update({ visual_id: id, code: "<p>2</p>" }), /このチャットにありません/);
  record(ctx, ctx.chat.id, "t1", "show_visual", { kind: "html", code: "<p>1</p>", title: "表" }, result);
  assert.match(ctx.tools.update({ visual_id: id, code: "<p>2</p>" }), new RegExp(`visual_id: ${id}`));
  assert.throws(() => ctx.otherTools.update({ visual_id: id, code: "<p>2</p>" }), /このチャットにありません/);
  assert.throws(() => ctx.tools.update({ visual_id: "v-zzzzzzzz", code: "<p>2</p>" }), /このチャットにありません/);
  assert.throws(() => ctx.tools.update({ visual_id: "なにか", code: "<p>2</p>" }), /このチャットにありません/);
});

test("collectVisuals: 記録から図を組み立て、描き直しは元の図に重ねる（失敗したものは数えない）", () => {
  const ctx = setup();
  const first = ctx.tools.show({ kind: "svg", code: "<svg>1</svg>", title: "A" });
  record(ctx, ctx.chat.id, "t1", "show_visual", { kind: "svg", code: "<svg>1</svg>", title: "A" }, first);
  const id = visualIdOf(first)!;
  record(ctx, ctx.chat.id, "t2", "update_visual", { visual_id: id, code: "<svg>2</svg>" }, ctx.tools.update({ visual_id: id, code: "<svg>2</svg>" }));
  ctx.store.events.add(ctx.chat.id, { type: "tool_use", id: "t3", name: "mcp__kickoff_chat__update_visual", input: { visual_id: id, code: "<svg>3</svg>" } });
  ctx.store.events.add(ctx.chat.id, { type: "tool_result", tool_use_id: "t3", content: "失敗", is_error: true });
  const visuals = collectVisuals(ctx.store.events.list(ctx.chat.id));
  assert.deepEqual(visuals.get(id), { id, kind: "svg", code: "<svg>2</svg>", title: "A", shownBy: "t1", updatedBy: ["t2"] });
});

test("visual_guide: 共通の決まりと、頼んだ種類の書き方を返す（省けば全部）", () => {
  const ctx = setup();
  const chart = ctx.tools.guide(["chart"]);
  assert.match(chart, /共通の決まり/);
  assert.match(chart, /--vis-chart-1/);
  assert.match(chart, /cdn\.jsdelivr\.net/);
  assert.match(chart, /# グラフ/);
  assert.doesNotMatch(chart, /# 画面のラフ/);
  const all = ctx.tools.guide([]);
  for (const heading of ["# 構造の図", "# グラフ", "# 画面のラフ", "# 動く部品", "# 数式"]) assert.ok(all.includes(heading), heading);
});
