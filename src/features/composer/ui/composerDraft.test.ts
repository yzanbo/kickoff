import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { Attachment } from "@shared/chat/types";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { appendDraft, chatComposerDraft, forgetChatDraft, memoryDraft } from "./composerDraft";
import { appendToDraft } from "./addToChat";

installMemoryStorage();

const file = (id: string): Attachment => ({ kind: "file", id, name: `${id}.png`, mime: "image/png", size: 1 });
const note = (id: string, path: string): Attachment => ({ kind: "note", id, name: path, mime: "text/markdown", size: 1, note: path, taken_at: "2026-11-22T00:00:00Z" });

test("チャットの下書き: 同じチャットには同じ店を返し、書いたら同じ残す先のほかの入力欄にも知らせる", () => {
  const draft = chatComposerDraft(1);
  assert.equal(chatComposerDraft(1), draft);
  assert.notEqual(chatComposerDraft(2).id, draft.id);
  const seen: string[] = [];
  const off = chatComposerDraft(1).subscribe(() => seen.push(chatComposerDraft(1).read().text));
  draft.write({ text: "書きかけ" });
  draft.write({ attachments: [file("a")] });
  off();
  assert.deepEqual(seen, ["書きかけ", "書きかけ"]);
  assert.deepEqual(draft.read(), { text: "書きかけ", attachments: [file("a")] });
  assert.deepEqual(chatComposerDraft(2).read(), { text: "", attachments: [] });
  forgetChatDraft(1);
  assert.deepEqual(draft.read(), { text: "", attachments: [] });
});

test("後ろに足す: 文は空行を挟み、添付は同じノートを新しい方に入れ替える（文が空なら文はそのまま）", () => {
  const draft = memoryDraft({ text: "前の文", attachments: [file("a"), note("n1", "m.md")] });
  appendDraft(draft, "足す文", [note("n2", "m.md")]);
  assert.deepEqual(draft.read(), { text: "前の文\n\n足す文", attachments: [file("a"), note("n2", "m.md")] });
  appendDraft(draft, "", [file("b")]);
  assert.equal(draft.read().text, "前の文\n\n足す文");
  assert.deepEqual(draft.read().attachments.map((a) => a.id), ["a", "n2", "b"]);
});

test("残さない下書き: 書くたびに渡した先へ中身を知らせる（新しいチャットのタブに添付を残す）", () => {
  const written: string[] = [];
  const draft = memoryDraft({}, (value, next) => written.push(`${"attachments" in next ? "添付" : "文"}:${value.attachments.length}`));
  draft.write({ text: "a" });
  draft.write({ attachments: [file("a")] });
  assert.deepEqual(written, ["文:0", "添付:1"]);
  assert.notEqual(memoryDraft().id, memoryDraft().id);
});

test("チャットに足す: 画面のないメインのウィンドウでは、そのチャットの下書きに足す", () => {
  vi.stubGlobal("location", { hash: "#/projects/1" });
  chatComposerDraft(5).write({ text: "書きかけ" });
  appendToDraft(5, "引用", [file("x")]);
  assert.deepEqual(chatComposerDraft(5).read(), { text: "書きかけ\n\n引用", attachments: [file("x")] });
  vi.unstubAllGlobals();
});

test("チャットに足す: 別ウィンドウからは自分の下書きに書かず、メインのウィンドウに頼んで前に出す", () => {
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {} })]);
  const focusMain = vi.fn(async () => {});
  vi.stubGlobal("location", { hash: "#/popout/sidebar" });
  vi.stubGlobal("window", { kickoff: { windows: { focusMain } } });
  appendToDraft(6, "引用");
  assert.deepEqual(chatComposerDraft(6).read(), { text: "", attachments: [] });
  assert.equal(focusMain.mock.calls.length, 1);
  vi.unstubAllGlobals();
});
