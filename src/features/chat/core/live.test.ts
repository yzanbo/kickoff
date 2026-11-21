import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { isBusyPhase, type ChatLive } from "@shared/chat/chatLive";
import { newMessage } from "@shared/chat/outbox";
import type { ChatRuntime } from "./runtime";
import { ChatRuntimes } from "./runtimes";

/** 作業中の様子のうち、段階と預かる理由に関わる新しい欄と古い欄 */
const pick = (live: ChatLive) => ({
  phase: live.phase,
  preparing_for: live.preparing_for,
  compact_by: live.compact_by,
  hold: live.hold,
  awaiting_compact: live.awaiting_compact,
  compact_after_turn: live.compact_after_turn,
  compacted_turn: live.compacted_turn,
  tells_closed: live.tells_closed,
  inheriting: live.inheriting,
  compacting: live.compacting?.trigger ?? null,
});

const idle: ReturnType<typeof pick> = { phase: "idle", preparing_for: null, compact_by: null, hold: null, awaiting_compact: false, compact_after_turn: false, compacted_turn: false, tells_closed: false, inheriting: false, compacting: null };
const env = { now: "2026-11-22T00:00:00.000Z", newId: () => "h1" };

/** 段階 × 預かる理由: 作業中の状態を作り、新しい欄と、同じ状態から作る古い欄を比べる */
const CASES: { name: string; arrange: (r: ChatRuntime) => void; want: Partial<ReturnType<typeof pick>> }[] = [
  { name: "作業していない", arrange: () => {}, want: {} },
  { name: "送る準備", arrange: (r) => (r.preparing = "send"), want: { phase: "preparing", preparing_for: "send" } },
  {
    name: "親の会話を写している",
    arrange: (r) => {
      r.preparing = "inherit";
      r.update({ inheriting: true });
    },
    want: { phase: "preparing", preparing_for: "inherit", hold: "inherit", inheriting: true },
  },
  { name: "ふつうの作業", arrange: (r) => r.startTurn("t", "message", new AbortController()), want: { phase: "running" } },
  {
    name: "自動の圧縮の前の指示を足した",
    arrange: (r) => {
      r.startTurn("t", "message", new AbortController());
      r.patchTurn({ compaction: { awaiting: true } });
    },
    want: { phase: "awaiting_compact", compact_by: "auto", hold: "compact", awaiting_compact: true },
  },
  {
    name: "作業中に手で頼んだ圧縮の圧縮前指示を伝えた",
    arrange: (r) => {
      r.startTurn("t", "message", new AbortController());
      r.patchTurn({ compaction: { awaiting: true, afterTurn: true } });
    },
    want: { phase: "awaiting_compact", compact_by: "manual", hold: "compact", awaiting_compact: true, compact_after_turn: true },
  },
  {
    name: "手で圧縮する実行（作業の終わりに続けた自動の圧縮）",
    arrange: (r) => r.startTurn("t", "compact", new AbortController(), "auto"),
    want: { phase: "awaiting_compact", compact_by: "auto", hold: "compact", awaiting_compact: true },
  },
  {
    name: "圧縮中",
    arrange: (r) => {
      r.startTurn("t", "message", new AbortController());
      r.patchTurn({ compaction: { running: { since: env.now, trigger: "auto" }, done: true } });
    },
    want: { phase: "compacting", hold: "compact", compacted_turn: true, compacting: "auto" },
  },
  {
    name: "圧縮したやり取りの途中",
    arrange: (r) => {
      r.startTurn("t", "post_compact", new AbortController());
      r.patchTurn({ compaction: { done: true } });
    },
    want: { phase: "compacted", hold: "exchange", compacted_turn: true },
  },
  {
    name: "入力が閉じた",
    arrange: (r) => {
      r.startTurn("t", "message", new AbortController());
      r.patchTurn({ tell: "closed" });
    },
    want: { phase: "running", hold: "closed", tells_closed: true },
  },
  {
    name: "預かった指示を書き直している",
    arrange: (r) => {
      r.startTurn("t", "message", new AbortController());
      r.setOutbox({ ...r.outbox, now: [newMessage(env, "いま", {}, [])] });
      r.setEditing("now", ["h1"]);
    },
    want: { phase: "running", hold: "editing" },
  },
];

for (const c of CASES) {
  test(`作業中の様子: ${c.name}の段階・預かる理由と、同じ状態から作る古い欄`, () => {
    const store = testStore(":memory:");
    const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
    const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });
    const runtimes = new ChatRuntimes({ store, onEditingChanged: () => {} });
    const runtime = runtimes.get(chat.id);
    c.arrange(runtime);
    const live = runtimes.live(chat.id);
    assert.deepEqual(pick(live), { ...idle, ...c.want });
    assert.equal(isBusyPhase(live.phase), runtime.busy);
    assert.equal(live.hold !== null, runtime.holdsTells);
    assert.deepEqual([live.status, live.provider_handoff, live.now, live.turn_end], ["running", null, runtime.outbox.now, []]);
    runtime.dispose();
  });
}
