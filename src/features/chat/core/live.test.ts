import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { isBusyPhase, type ChatLive, type PrepareReason } from "@shared/chat/chatLive";
import { compactionAtStart, holdOf, noCompaction } from "@/features/chat/core/run/machine/state";
import type { TurnPhase } from "@/features/chat/core/run/machine/types";
import { newMessage } from "@shared/chat/outbox";
import type { ChatRun } from "@/features/chat/core/run/chatRun";
import { ChatRuns } from "@/features/chat/core/run/chatRuns";

/** 作業中の様子のうち、段階と預かる理由に関わる欄 */
const pick = (live: ChatLive) => ({
  phase: live.phase,
  preparing_for: live.preparing_for,
  compact_by: live.compact_by,
  hold: live.hold,
  compaction: live.compaction,
  input_closed: live.input_closed,
  compacting: live.compacting?.trigger ?? null,
});

const idle: ReturnType<typeof pick> = { phase: "idle", preparing_for: null, compact_by: null, hold: null, compaction: { awaiting: false, after_turn: false, done: false }, input_closed: false, compacting: null };
const env = { now: "2026-11-22T00:00:00.000Z", newId: () => "h1" };

/** 作業中の段階を置く（指定のない欄はふつうの作業の始まり） */
const turn =
  (patch: Partial<TurnPhase> = {}) =>
  (r: ChatRun) =>
    r.commit({ ...r.run, phase: { kind: "turn", id: "t", turn: "message", tell: "opening", compaction: noCompaction(), stopRequested: false, telling: null, compactBy: null, ...patch } });
const preparing = (why: PrepareReason) => (r: ChatRun) => r.commit({ ...r.run, phase: { kind: "preparing", why, stopRequested: false } });

/** 圧縮の様子（書いた欄のほかは立っていない） */
const compaction = (patch: Partial<ChatLive["compaction"]>): ChatLive["compaction"] => ({ awaiting: false, after_turn: false, done: false, ...patch });

/** 段階 × 預かる理由: 作業中の状態を作り、段階・預かる理由・圧縮の様子・足す口を比べる */
const CASES: { name: string; arrange: (r: ChatRun) => void; want: Partial<ReturnType<typeof pick>> }[] = [
  { name: "作業していない", arrange: () => {}, want: {} },
  { name: "送る準備", arrange: preparing("send"), want: { phase: "preparing", preparing_for: "send" } },
  { name: "親の会話を写している", arrange: preparing("inherit"), want: { phase: "preparing", preparing_for: "inherit", hold: "inherit" } },
  { name: "ふつうの作業", arrange: turn(), want: { phase: "running" } },
  { name: "自動の圧縮の前の指示を足した", arrange: turn({ compaction: { ...noCompaction(), awaiting: true } }), want: { phase: "awaiting_compact", compact_by: "auto", hold: "compact", compaction: compaction({ awaiting: true }) } },
  {
    name: "作業中に手で頼んだ圧縮の圧縮前指示を伝えた",
    arrange: turn({ compaction: { ...noCompaction(), awaiting: true, afterTurn: true } }),
    want: { phase: "awaiting_compact", compact_by: "manual", hold: "compact", compaction: compaction({ awaiting: true, after_turn: true }) },
  },
  {
    name: "手で圧縮する実行（作業の終わりに続けた自動の圧縮）",
    arrange: turn({ turn: "compact", tell: "never", compaction: compactionAtStart("compact"), compactBy: "auto" }),
    want: { phase: "awaiting_compact", compact_by: "auto", hold: "compact", compaction: compaction({ awaiting: true }) },
  },
  {
    name: "圧縮中",
    arrange: turn({ compaction: { ...noCompaction(), running: { since: env.now, trigger: "auto" }, done: true } }),
    want: { phase: "compacting", hold: "compact", compaction: compaction({ done: true }), compacting: "auto" },
  },
  { name: "圧縮したやり取りの途中", arrange: turn({ turn: "post_compact", compaction: compactionAtStart("post_compact") }), want: { phase: "compacted", hold: "exchange", compaction: compaction({ done: true }) } },
  { name: "入力が閉じた", arrange: turn({ tell: "closed" }), want: { phase: "running", hold: "closed", input_closed: true } },
  {
    name: "預かった指示を書き直している",
    arrange: (r) => {
      turn()(r);
      r.commit({ ...r.run, outbox: { ...r.outbox, now: [newMessage(env, "いま", {}, [])] }, editing: { now: ["h1"], later: [] } });
    },
    want: { phase: "running", hold: "editing" },
  },
];

for (const c of CASES) {
  test(`作業中の様子: ${c.name}の段階・預かる理由・圧縮の様子`, () => {
    const store = testStore();
    const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
    const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });
    const runtimes = new ChatRuns({ store });
    const runtime = runtimes.get(chat.id);
    c.arrange(runtime);
    const live = runtimes.live(chat.id);
    assert.deepEqual(pick(live), { ...idle, ...c.want });
    assert.equal(isBusyPhase(live.phase), runtime.busy);
    assert.equal(live.hold, holdOf(runtime.run));
    assert.deepEqual([live.status, live.provider_handoff, live.now, live.turn_end], ["running", null, runtime.outbox.now, []]);
    runtime.dispose();
  });
}
