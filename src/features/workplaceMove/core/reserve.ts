// AI が作業場所を移す予約: AI の move_workplace は予約するだけで（chat の作業の終わりの予約 reserveAtTurnEnd。種類 move_workplace・order 20・最後まで終わった作業だけ）、
// その作業が最後まで終わったら Kickoff が移し、続きの指示を送る。順番は「片付け → 移す → 予約した圧縮・消去 → 続き（＋移動の知らせ）→ 預かった『いま』→ 送信待ち」。
// 予約は作業中の様子（ChatLive の workplace_move）に出し、画面・スマホ・AI から取り消せる。同じ作業で何度も頼んだら最後のものだけを残す
import { errorMessage } from "@shared/foundation/errors";
import type { WorkplaceMoveBody } from "@shared/foundation/apiTypes";
import { workdirOf, type ChatRunPort, type Store, type TurnEndTask } from "@/features/chat/core/index";
import { planUserWorkplaceMove, runningTerminals, type WorkplaceUserMoveDeps } from "./workplaceUserMove";

/** AI が予約した移動（移す先・持っていくか・画面に出す呼び名・続きの指示） */
export interface WorkplaceMovePlan {
  body: WorkplaceMoveBody;
  /** 移す先の呼び名（「本体」「ワークツリー（feat/x）」「新しいワークツリー（feat/x）」） */
  label: string;
  /** 移したあとに送る続きの指示（なければ移すだけ） */
  continuation: string | null;
}

export interface WorkplaceMoveRunDeps {
  store: Store;
  runner: Pick<ChatRunPort, "isBusy" | "live" | "moveWorkplace" | "reservedFolders" | "reserveAtTurnEnd" | "continuation">;
  terminals?: WorkplaceUserMoveDeps["terminals"];
  worktreeEnvs?: WorkplaceUserMoveDeps["worktreeEnvs"];
}

/** 予約する（前の予約は置き換える。済んだら・取り消したら作業中の様子からも消える） */
export function reserveMove(deps: WorkplaceMoveRunDeps, chatId: number, plan: WorkplaceMovePlan): void {
  const task: TurnEndTask = {
    kind: "move_workplace",
    order: 20,
    label: plan.label,
    when: "completed",
    pauseQueue: false,
    shown: { label: plan.label, carry: Boolean(plan.body.carry), continuation: plan.continuation !== null },
    run: async ({ done }) => {
      await runReservedMove(deps, chatId, plan, done.includes("finish_worktree"));
      return "done";
    },
    skipped: () => notMovedNotice(plan),
    cancelled: () => cancelledNote(plan),
  };
  deps.runner.reserveAtTurnEnd(chatId, task);
}

/**
 * 利用者が予約を取り消したことを AI に伝える文（作業中ならその場で足し、足せなければ次の指示に一度だけ添える。
 * 取り消したことを知らないまま「移ってから続けます」と答えたり、移ったつもりで進めたりしないように）
 */
function cancelledNote(plan: WorkplaceMovePlan): string {
  return `Kickoff からの知らせ（利用者の発言ではありません）: 利用者が、あなたが予約した作業場所の移動（${plan.label}へ）を取り消しました。作業が終わっても移らず、続きの指示も送りません。いまの作業場所のまま続けてください。`;
}

/** 止めた・失敗した作業では移さない（予約を消し、そう知らせる） */
function notMovedNotice(plan: WorkplaceMovePlan): string {
  return `作業が最後まで終わらなかったので、AI が予約した「${plan.label}へ移る」はしませんでした（予約を取り消しました）`;
}

/**
 * 最後まで終わった作業の終わり（段階 settling）に、予約どおり移す。片付けの予約が同じチャットにあれば、先にそれを済ませてある（afterFinish）。
 * 移せたら続きの指示を置く（placeContinuation）。移せなければお知らせを残し、続きは送らない。
 * このあと殻がいつもの作業の終わりの処理（圧縮・預かった「いま」・送信待ち）を続ける
 */
async function runReservedMove(deps: WorkplaceMoveRunDeps, chatId: number, plan: WorkplaceMovePlan, afterFinish: boolean) {
  const { store, runner } = deps;
  // 移すチャット自身は作業の終わりにすること（settling）の中で移すので、そのチャットは次の作業が始まったときだけ作業中に数える
  const isBusy = (id: number) => (id === chatId ? runner.live(id).phase !== "settling" && runner.isBusy(id) : runner.isBusy(id));
  try {
    if (isBusy(chatId)) throw new Error("待つ間に次の作業が始まったため");
    const chat = store.chats.get(chatId);
    const project = chat ? store.projects.get(chat.project_id) : undefined;
    if (!chat || !project) return;
    // 移す先が本体で、片付けで本体に戻ったなら、移す予約は済んだものとする
    const body: WorkplaceMoveBody = afterFinish ? { ...plan.body, carry: false } : plan.body;
    const done = !body.new_worktree_branch && body.worktree_path === chat.worktree_path;
    if (!done) {
      const dir = workdirOf(chat, project);
      const target = body.new_worktree_branch ? undefined : body.worktree_path;
      const busy = target === undefined ? 0 : store.chats.list({ projectId: project.id }).filter((c) => c.id !== chatId && c.worktree_path === target && isBusy(c.id)).length;
      const running = runningTerminals(deps, dir, project.id).map((t) => (t.command ? `${t.title}（${t.command}）` : t.title));
      const { input, steps } = await planUserWorkplaceMove({ reservedFolders: () => runner.reservedFolders(), terminals: deps.terminals, worktreeEnvs: deps.worktreeEnvs }, chat, project, body, "ai");
      await runner.moveWorkplace(chatId, { ...input, ...(running.length ? { running } : {}), ...(busy ? { busy } : {}), ...(afterFinish ? { afterFinish: true } : {}) }, steps);
    }
    // 移したあとの続きの指示を出す箱に置く（止めていて送らないときはお知らせを残す。@shared/chat/outbox の placeContinuation）
    if (plan.continuation !== null) runner.continuation(chatId, plan.continuation, afterFinish);
  } catch (e) {
    store.events.add(chatId, { type: "notice", message: `AI が予約した「${plan.label}へ移る」ができませんでした（${errorMessage(e)}）。元の作業場所のまま、続きの指示は送りません` });
  }
}
