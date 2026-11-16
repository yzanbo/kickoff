// AI が作業場所を移す予約（メモの仕様書「0025_チャットの作業場所を変える」の段階 ③）: AI の move_workplace は予約するだけで、
// その作業が最後まで終わったら Kickoff が移し、続きの指示を送る。順番は「移す → 予約した圧縮・消去 → 続き（＋移動の知らせ）→ 預かった『いま』→ 送信待ち」（H8）。
// 予約は作業中の様子（ChatLive の workplace_move）に出し、画面・スマホ・AI から取り消せる（I2・J7）。同じ作業で何度も頼んだら最後のものだけを残す
import { randomUUID } from "node:crypto";
import { errorMessage } from "@shared/errors";
import type { Chat, QueuedMessage, WorkplaceMoveBody } from "@shared/types";
import type { Store } from "../db/store.js";
import type { TerminalControl } from "../terminal/control.js";
import type { WorktreeEnvService } from "../worktreeEnv/service.js";
import type { WorktreeFinisher } from "../worktrees/finish.js";
import type { ChatRuntime, ChatRuntimes } from "./runtime.js";
import type { WorkplaceMoveInput, WorkplaceMoveSteps } from "./workplaceMove.js";
import { planUserWorkplaceMove, runningTerminals } from "./workplaceUserMove.js";
import { workdirOf } from "./workdir.js";

/** AI が予約した移動（移す先・持っていくか・画面に出す呼び名・続きの指示） */
export interface WorkplaceMovePlan {
  body: WorkplaceMoveBody;
  /** 移す先の呼び名（「本体」「ワークツリー（feat/x）」「新しいワークツリー（feat/x）」） */
  label: string;
  /** 移したあとに送る続きの指示（なければ移すだけ） */
  continuation: string | null;
}

/** 予約を覚える所（メモリだけ。Kickoff を終えたら消える = 作業も止まるので、移す時は来ない） */
export class WorkplaceReservations {
  private readonly reserved = new Map<number, WorkplaceMovePlan>();

  constructor(private readonly runtimes: ChatRuntimes) {}

  /** 予約する（前の予約は置き換える。I2） */
  reserve(chatId: number, plan: WorkplaceMovePlan) {
    this.reserved.set(chatId, plan);
    this.runtimes.get(chatId).update({ workplaceMove: { label: plan.label, carry: Boolean(plan.body.carry), continuation: plan.continuation !== null } });
  }

  /** 取り消す（取り消した予約。なければ null） */
  cancel(chatId: number): WorkplaceMovePlan | null {
    const plan = this.reserved.get(chatId) ?? null;
    if (!plan) return null;
    this.reserved.delete(chatId);
    this.runtimes.get(chatId).update({ workplaceMove: null });
    return plan;
  }

  /** 作業の終わりに予約を取り出す（画面の予約の表示も消す） */
  take(chatId: number): WorkplaceMovePlan | null {
    return this.cancel(chatId);
  }
}

export interface WorkplaceMoveRunDeps {
  store: Store;
  runtimes: ChatRuntimes;
  isBusy: (chatId: number) => boolean;
  moveWorkplace: (chatId: number, input: WorkplaceMoveInput, steps?: WorkplaceMoveSteps) => Promise<Chat>;
  worktreeFinisher?: Pick<WorktreeFinisher, "hasReservation" | "afterReservation" | "reservedFolders">;
  terminals?: Pick<TerminalControl, "list">;
  worktreeEnvs?: Pick<WorktreeEnvService, "prepare">;
}

/** 止めた・失敗した作業では移さない（予約を消し、そう知らせる） */
export function notMovedNotice(plan: WorkplaceMovePlan): string {
  return `作業が最後まで終わらなかったので、AI が予約した「${plan.label}へ移る」はしませんでした（予約を取り消しました）`;
}

/**
 * 最後まで終わった作業の終わりに、予約どおり移す。片付けの予約が同じチャットにあれば、それが済むのを待ってから（G4・J3）。
 * 移せたら続きの指示を置く（placeContinuation）。移せなければお知らせを残し、続きは送らない（G6）。
 * このあと Runner がいつもの作業の終わりの処理（圧縮・預かった「いま」・送信待ち）を続ける
 */
export async function runReservedMove(deps: WorkplaceMoveRunDeps, chatId: number, plan: WorkplaceMovePlan) {
  const { store, runtimes, worktreeFinisher } = deps;
  const runtime = runtimes.get(chatId);
  try {
    // 片付けを先にする（片付けはこのチャットが作業中でなくなるのを待つので、待つ間は作業中として数えない）
    const afterFinish = worktreeFinisher?.hasReservation(chatId) ?? false;
    if (afterFinish) await worktreeFinisher!.afterReservation(chatId);
    if (deps.isBusy(chatId)) throw new Error("待つ間に次の作業が始まったため");
    const chat = store.chats.get(chatId);
    const project = chat ? store.projects.get(chat.project_id) : undefined;
    if (!chat || !project) return;
    // 移す先が本体で、片付けで本体に戻ったなら、移す予約は済んだものとする（G4）
    const body: WorkplaceMoveBody = afterFinish ? { ...plan.body, carry: false } : plan.body;
    const done = !body.new_worktree_branch && body.worktree_path === chat.worktree_path;
    if (!done) {
      runtime.preparing = true;
      try {
        const dir = workdirOf(chat, project);
        const target = body.new_worktree_branch ? undefined : body.worktree_path;
        const busy = target === undefined ? 0 : store.chats.list({ projectId: project.id }).filter((c) => c.id !== chatId && c.worktree_path === target && deps.isBusy(c.id)).length;
        const running = runningTerminals(deps, dir, project.id).map((t) => (t.command ? `${t.title}（${t.command}）` : t.title));
        const { input, steps } = await planUserWorkplaceMove(
          { reservedFolders: () => worktreeFinisher?.reservedFolders() ?? new Set(), terminals: deps.terminals, worktreeEnvs: deps.worktreeEnvs },
          chat,
          project,
          body,
          "ai",
        );
        await deps.moveWorkplace(chatId, { ...input, ...(running.length ? { running } : {}), ...(busy ? { busy } : {}), ...(afterFinish ? { afterFinish: true } : {}) }, steps);
      } finally {
        runtime.preparing = false;
      }
    }
    if (plan.continuation !== null) placeContinuation(store, runtime, chatId, plan.continuation, afterFinish);
  } catch (e) {
    store.events.add(chatId, { type: "notice", message: `AI が予約した「${plan.label}へ移る」ができませんでした（${errorMessage(e)}）。元の作業場所のまま、続きの指示は送りません` });
  }
}

/**
 * 移したあとの続きの指示を置く: 送信待ちの先頭に予約した圧縮・消去があればそのあと（H8）、なければ預かった「いま」の前（作業の終わりに 1 件目として送り、
 * 残りの「いま」はその作業に伝える）。利用者が送信待ちを止めていれば、送らずに送信待ちの先頭に入れる（G5）。
 * 片付けを先にしたときは、片付けが止めた送信待ちは止めたまま、続きだけを送る（J3）
 */
function placeContinuation(store: Store, runtime: ChatRuntime, chatId: number, text: string, afterFinish: boolean) {
  const { queue } = runtime;
  const actions = leadingActions(queue.list());
  const stopped = queue.isPaused() || queue.stopPositions().some((p) => p <= actions);
  if (!afterFinish && stopped) {
    queue.insertAt(text, { workplace_continuation: true }, actions, true);
    store.events.add(chatId, { type: "notice", message: "送信待ちを止めているので、AI が予約した続きの指示は送らずに送信待ちの先頭に入れました" });
    return;
  }
  if (!afterFinish && actions > 0) {
    queue.insertAt(text, { workplace_continuation: true }, actions, false);
    return;
  }
  const message: QueuedMessage = { id: randomUUID(), text, options: {}, attachments: [], created_at: new Date().toISOString(), workplace_continuation: true };
  runtime.update({ afterCompact: [message, ...runtime.afterCompact] });
}

/** 送信待ちの先頭に続く、予約した圧縮・消去の行の数 */
function leadingActions(list: readonly QueuedMessage[]): number {
  let n = 0;
  while (n < list.length && (list[n].compact || list[n].clear)) n++;
  return n;
}
