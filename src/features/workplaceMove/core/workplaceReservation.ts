// AI が作業場所を移す予約: AI の move_workplace は予約するだけで、
// その作業が最後まで終わったら Kickoff が移し、続きの指示を送る。順番は「移す → 予約した圧縮・消去 → 続き（＋移動の知らせ）→ 預かった『いま』→ 送信待ち」。
// 予約は作業中の様子（ChatLive の workplace_move）に出し、画面・スマホ・AI から取り消せる。同じ作業で何度も頼んだら最後のものだけを残す
import { errorMessage } from "@shared/foundation/errors";
import type { Chat } from "@shared/chat/types";
import { newMessage, placeContinuation as placeInOutbox } from "@shared/chat/outbox";
import type { WorkplaceMoveBody } from "@shared/foundation/apiTypes";
import type { Store } from "@/features/chat/core/index";
import type { TerminalControl } from "@/features/terminal/core/control";
import type { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import type { WorktreeFinisher } from "@/features/worktrees/core/finish";
import { outboxEnv, type ChatRuntime, type RuntimeLookup } from "@/features/chat/core/runtime";
import type { WorkplaceMoveInput, WorkplaceMoveSteps } from "./workplaceMove";
import { planUserWorkplaceMove, runningTerminals } from "./workplaceUserMove";
import { workdirOf } from "@/features/chat/core/workdir";

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

  constructor(private readonly runtimes: RuntimeLookup) {}

  /** 予約する（前の予約は置き換える） */
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
  runtimes: RuntimeLookup;
  isBusy: (chatId: number) => boolean;
  moveWorkplace: (chatId: number, input: WorkplaceMoveInput, steps?: WorkplaceMoveSteps) => Promise<Chat>;
  worktreeFinisher?: Pick<WorktreeFinisher, "hasReservation" | "afterReservation" | "reservedFolders">;
  terminals?: Pick<TerminalControl, "list">;
  worktreeEnvs?: Pick<WorktreeEnvService, "prepare">;
}

/**
 * 利用者が予約を取り消したことを AI に伝える文（作業中ならその場で足し、足せなければ次の指示に一度だけ添える。
 * 取り消したことを知らないまま「移ってから続けます」と答えたり、移ったつもりで進めたりしないように）
 */
export function cancelledNote(plan: WorkplaceMovePlan): string {
  return `Kickoff からの知らせ（利用者の発言ではありません）: 利用者が、あなたが予約した作業場所の移動（${plan.label}へ）を取り消しました。作業が終わっても移らず、続きの指示も送りません。いまの作業場所のまま続けてください。`;
}

/** 止めた・失敗した作業では移さない（予約を消し、そう知らせる） */
export function notMovedNotice(plan: WorkplaceMovePlan): string {
  return `作業が最後まで終わらなかったので、AI が予約した「${plan.label}へ移る」はしませんでした（予約を取り消しました）`;
}

/**
 * 最後まで終わった作業の終わりに、予約どおり移す。片付けの予約が同じチャットにあれば、それが済むのを待ってから。
 * 移せたら続きの指示を置く（placeContinuation）。移せなければお知らせを残し、続きは送らない。
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
    // 移す先が本体で、片付けで本体に戻ったなら、移す予約は済んだものとする
    const body: WorkplaceMoveBody = afterFinish ? { ...plan.body, carry: false } : plan.body;
    const done = !body.new_worktree_branch && body.worktree_path === chat.worktree_path;
    if (!done) {
      runtime.preparing = "move_workplace";
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
        runtime.preparing = null;
      }
    }
    if (plan.continuation !== null) placeContinuation(store, runtime, chatId, plan.continuation, afterFinish);
  } catch (e) {
    store.events.add(chatId, { type: "notice", message: `AI が予約した「${plan.label}へ移る」ができませんでした（${errorMessage(e)}）。元の作業場所のまま、続きの指示は送りません` });
  }
}

/** 移したあとの続きの指示を出す箱に置く（置き方は @shared/chat/outbox の placeContinuation。止めていて送らないときはお知らせを残す） */
function placeContinuation(store: Store, runtime: ChatRuntime, chatId: number, text: string, afterFinish: boolean) {
  const placed = placeInOutbox(runtime.outbox, newMessage(outboxEnv(), text, {}, [], { workplace_continuation: true }), afterFinish);
  runtime.setOutbox(placed.box);
  if (placed.stopped) store.events.add(chatId, { type: "notice", message: "送信待ちを止めているので、AI が予約した続きの指示は送らずに送信待ちの先頭に入れました" });
}
