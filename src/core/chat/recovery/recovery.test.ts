// 止まったあとの再開の段取り（ChatRecovery）の単体のテスト。API を通した流れは http/server.recovery.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalCenter } from "../approvals.js";
import { Bus } from "../../bus.js";
import { Store } from "../../db/store.js";
import { ChatRuntimes } from "../runtime.js";
import { ChatRecovery } from "./recovery.js";
import { RESUME_PROMPT, USAGE_RESUME_PROMPT } from "@shared/chat/prompts";
import type { PlanUsage } from "@shared/types";
import type { TurnOutcome } from "../turn.js";

const RESET = "2026-11-04T10:30:00.000Z";

/** 送ったら作業中にし（Runner の send と同じ）、終わりは finish で知らせる */
function setup({ usage }: { usage?: () => Promise<PlanUsage> } = {}) {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const runtimes = new ChatRuntimes({ store, bus, onEditsChanged: () => {} });
  const project = store.projects.create({ name: "p", repo_path: "/tmp", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "failed", model: null });
  const sent: string[] = [];
  const network = { online: false };
  const clock = { now: Date.parse(RESET) - 3_600_000 };
  const recovery = new ChatRecovery({
    store,
    approvals,
    runtimes,
    isBusy: (chatId) => runtimes.isBusy(chatId),
    send: async (chatId, text) => {
      recovery.forget(chatId);
      sent.push(text);
      store.chats.update(chatId, { status: "running" });
    },
    usage: usage && { get: usage },
    reconnect: { check: async () => network.online, intervalMs: 5 },
    usageLimit: { now: () => clock.now, checkMs: 5 },
  });
  const runtime = runtimes.get(chat.id);
  /** 作業が終わった（状態を変えてから、段取りに知らせる。送信待ちを送ってよいかを返す） */
  const finish = (outcome: TurnOutcome) => {
    store.chats.update(chat.id, { status: outcome.status });
    return recovery.finished(chat.id, outcome);
  };
  const notices = () => store.events.list(chat.id).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  return { store, approvals, recovery, runtime, chat, sent, network, clock, finish, notices };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}

const usageLimit = (resetsAt: string | null): TurnOutcome => ({ status: "failed", network: false, usageLimit: { resetsAt } });
const networkFailure: TurnOutcome = { status: "failed", network: true };

test("使用枠の上限: 待つ時間ではなく時計の時刻で見て、戻る時刻（＋1 分）を過ぎてから聞く。続けて最後まで終わったら送信待ちを戻す", async () => {
  const { approvals, runtime, chat, sent, clock, finish, notices } = setup();
  runtime.queue.add("次", {}, []);
  assert.equal(finish(usageLimit(RESET)), false);
  assert.equal(runtime.queue.isPaused(), true);
  assert.match(notices()[0], /枠が戻ったら、続けるかを確かめます。送信待ちは止めてあります。/);

  // 戻る時刻のちょうど 1 分後までは聞かない
  clock.now = Date.parse(RESET) + 59_000;
  await tick();
  await tick();
  assert.equal(approvals.list({ chatId: chat.id }).length, 0);
  clock.now = Date.parse(RESET) + 60_000;
  await until(() => approvals.list({ chatId: chat.id }).length === 1);
  const [ask] = approvals.list({ chatId: chat.id });
  assert.equal(ask.kind, "usage_limit");

  approvals.resolve(ask.id, { action: "allow" });
  await until(() => sent.length === 1);
  assert.deepEqual(sent, [USAGE_RESUME_PROMPT]);
  assert.equal(finish({ status: "completed", network: false }), true);
  assert.equal(runtime.queue.isPaused(), false);
});

test("続けて別の理由で止まったら、前の段取りは新しい段取りに置き換える（枠が戻って続けるかを聞いている → 通信の切断）", async () => {
  const { approvals, runtime, chat, sent, network, clock, finish } = setup();
  runtime.queue.add("次", {}, []);
  // 枠が戻る時刻はもう過ぎている: すぐ聞く
  clock.now = Date.parse(RESET) + 120_000;
  finish(usageLimit(RESET));
  assert.equal(approvals.list({ chatId: chat.id }).length, 1);
  assert.equal(runtime.live().reconnect, null);
  // 聞いている間に（手で圧縮したときなど）通信の切断で止まった: 聞くのを取り下げ、つながるのを待つ
  finish(networkFailure);
  assert.equal(approvals.list({ chatId: chat.id }).length, 0);
  assert.deepEqual(runtime.live().reconnect, { attempts: 0, max: 3, agents: [] });
  // 取り下げた確かめの答え（中断）で、止めた送信待ちを忘れない。つながったら自動で再開する
  await tick();
  assert.equal(runtime.recovery.held, true);
  network.online = true;
  await until(() => sent.length === 1);
  assert.deepEqual(sent, [RESUME_PROMPT]);
  assert.equal(runtime.live().reconnect, null);
});

test("使用枠の上限: 枠の戻る時刻を調べている間に自分で送ったら、その段取りはやめる（あとから待ち始めない）", async () => {
  let answer!: (usage: PlanUsage) => void;
  const { approvals, runtime, chat, recovery, clock, finish, notices } = setup({ usage: () => new Promise((resolve) => (answer = resolve)) });
  finish(usageLimit(null));
  // 自分で送った（再開の段取りは忘れる）
  recovery.forget(chat.id);
  const window = { key: "five_hour", label: "5 時間", utilization: 100, resets_at: RESET };
  answer({ provider: "claude", provider_label: "Claude", available: true, plan: "max", five_hour: window, seven_day: { ...window, utilization: 10 }, model_weekly: [], fetched_at: RESET });
  await tick();
  assert.deepEqual(notices(), []);
  assert.equal(runtime.recovery.waiting, null);
  clock.now = Date.parse(RESET) + 120_000;
  await tick();
  assert.equal(approvals.list({ chatId: chat.id }).length, 0);
});

test("「自動で再開しない」は、つながるのを待っているときだけやめられる（枠の戻りを待っているときは false）", () => {
  const { recovery, chat, finish } = setup();
  finish(usageLimit(RESET));
  assert.equal(recovery.stopWaiting(chat.id), false);
  finish(networkFailure);
  assert.equal(recovery.stopWaiting(chat.id), true);
  assert.equal(recovery.stopWaiting(chat.id), false);
});
