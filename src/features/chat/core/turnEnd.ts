// 作業の終わりに行う予約の入れ物（ワークツリーの片付け・作業場所の移動・アーカイブ・削除）。予約するのは持ち主の機能（worktrees・workplaceMove・chat のツール）で、
// 入れ物は順番と時を決めるだけ（メモリだけ。Kickoff を終えたら消える）。作業が終わったら送信待ちを先に止め（pauseQueue）、order の順に行う:
// - 最後まで終わった作業でだけ行う予約（when: completed = 作業場所の移動）があれば、段階 settling（作業中のまま）でそこまでを行い、済んだら settled で続ける
// - そのほか（when: any）は、作業していないに戻ってから行う。wait を返したものは、どれかのチャットが作業していないに戻るたびにもう一度試す
import type { WorkplaceMoveReservation } from "@shared/chat/chatLive";
import type { Log } from "@/foundation/core/kernel";
import type { ChatRuns } from "@/features/chat/core/run/chatRuns";
import type { RunEvent } from "@/features/chat/core/run/machine/types";

export const TURN_END_KINDS = ["finish_worktree", "move_workplace", "archive_chat", "delete_chat"] as const;
export type TurnEndKind = (typeof TURN_END_KINDS)[number];

/** 作業の終わりに行う予約 */
export interface TurnEndTask {
  kind: TurnEndKind;
  /** 同じ種類の予約を見分ける（同じ種類・同じ key の予約は置き換える。省けば種類ごとに 1 つ） */
  key?: string;
  /** 行う順（片付け 10 → 移動 20 → アーカイブ・削除 30） */
  order: number;
  /** 画面と AI に見せる呼び名 */
  label: string;
  /** 止めた・失敗した作業でも行うか（移動は completed、片付け・アーカイブ・削除は any） */
  when: "completed" | "any";
  /** 作業が終わったら、行う前に送信待ちを止める */
  pauseQueue: boolean;
  /** 行う（wait = まだ行えない。ほかのチャットが作業していないに戻ったらもう一度）。done = 先に行った同じチャットの予約の種類 */
  run(ctx: { done: readonly TurnEndKind[] }): Promise<"done" | "wait">;
  /** 行わなかったときのお知らせ（when が合わなかった） */
  skipped?(): string;
  /** 利用者が取り消したことを AI に伝える文 */
  cancelled?(): string;
  /** 片付けるフォルダ（ほかの予約・利用者の移動が見る） */
  folder?: string;
  /** 作業中の様子に出す作業場所の移動の予約 */
  shown?: WorkplaceMoveReservation;
}

export interface TurnEndDeps {
  runs: ChatRuns;
  dispatch(chatId: number, event: RunEvent): void;
  chatExists(chatId: number): boolean;
  /** チャットに残すお知らせ */
  notice(chatId: number, message: string): void;
  log?: Pick<Log, "warn">;
}

const sameTask = (a: TurnEndTask, b: TurnEndTask) => a.kind === b.kind && (a.key ?? "") === (b.key ?? "");

export class TurnEndTasks {
  private readonly tasks = new Map<number, TurnEndTask[]>();
  /** 行っている途中のチャット（同じチャットの予約を並べて行わない） */
  private readonly running = new Set<number>();
  /** 段階 settling で、待つ予約が済むのを待っているチャット */
  private readonly settling = new Set<number>();
  /** 済んだ予約の種類（作業の終わりごと。あとの予約が先に何をしたかを見る） */
  private readonly done = new Map<number, TurnEndKind[]>();
  private retrying = false;

  constructor(private readonly deps: TurnEndDeps) {}

  /** 予約する（同じ予約は置き換える）。作業していないチャットの予約は、すぐ試す */
  reserve(chatId: number, task: TurnEndTask) {
    const list = (this.tasks.get(chatId) ?? []).filter((t) => !sameTask(t, task));
    this.tasks.set(chatId, [...list, task].sort((a, b) => a.order - b.order));
    this.show(chatId);
    if (!this.deps.runs.peek(chatId)?.busy) this.retry();
  }

  /** 取り消す（取り消した予約。なければ null） */
  cancel(chatId: number, kind: TurnEndKind): TurnEndTask | null {
    const list = this.tasks.get(chatId) ?? [];
    const task = list.find((t) => t.kind === kind) ?? null;
    if (task) this.remove(chatId, task);
    return task;
  }

  has(chatId: number, kind?: TurnEndKind): boolean {
    return (this.tasks.get(chatId) ?? []).some((t) => kind === undefined || t.kind === kind);
  }

  /** 最後まで終わった作業でだけ行う予約があるか（あれば作業の終わりは段階 settling で行う） */
  hasSettling(chatId: number): boolean {
    return (this.tasks.get(chatId) ?? []).some((t) => t.when === "completed");
  }

  /** 予約で片付けるフォルダ */
  reservedFolders(): Set<string> {
    return new Set([...this.tasks.values()].flat().flatMap((t) => (t.folder ? [t.folder] : [])));
  }

  /** 1 回の実行が終わった（turn_ended より前）: 送信待ちを先に止める予約があれば止める */
  turnEnded(chatId: number) {
    this.done.delete(chatId);
    if ((this.tasks.get(chatId) ?? []).some((t) => t.pauseQueue)) this.deps.dispatch(chatId, { type: "queue", commands: [{ op: "set_paused", paused: true }] });
  }

  /** 段階 settling（最後まで終わった作業）: 最後まで終わった作業でだけ行う予約までを順に行い、済んだら settled で続ける */
  settle(chatId: number) {
    this.settling.add(chatId);
    void this.runSettling(chatId);
  }

  /** 止めた・失敗した作業: 最後まで終わった作業でだけ行う予約は行わずに消し（notice ならお知らせ）、ほかは作業していないに戻ってから行う */
  drop(chatId: number, notice: boolean) {
    for (const task of (this.tasks.get(chatId) ?? []).filter((t) => t.when === "completed")) {
      this.remove(chatId, task);
      const text = task.skipped?.();
      if (notice && text) this.deps.notice(chatId, text);
    }
    this.retry();
  }

  /** チャットを消したとき */
  forget(chatId: number) {
    this.tasks.delete(chatId);
    this.settling.delete(chatId);
    this.done.delete(chatId);
  }

  /** どれかのチャットが作業していないに戻った: 待っている予約をもう一度試す（出来事を回し終えてから） */
  retry() {
    if (this.retrying) return;
    this.retrying = true;
    queueMicrotask(() => {
      this.retrying = false;
      for (const chatId of [...this.tasks.keys()]) {
        if (this.settling.has(chatId)) void this.runSettling(chatId);
        else if (!this.deps.runs.peek(chatId)?.busy) void this.runRest(chatId);
      }
    });
  }

  private show(chatId: number) {
    const shown = (this.tasks.get(chatId) ?? []).find((t) => t.shown)?.shown ?? null;
    if (shown || this.deps.runs.peek(chatId)) this.deps.runs.get(chatId).setWorkplaceMove(shown);
  }

  private remove(chatId: number, task: TurnEndTask) {
    const list = (this.tasks.get(chatId) ?? []).filter((t) => t !== task);
    if (list.length > 0) this.tasks.set(chatId, list);
    else this.tasks.delete(chatId);
    this.show(chatId);
  }

  /** 予約を順に行う（wait が返ったらそこで止める。済んだら true） */
  private async runInOrder(chatId: number, upTo: number): Promise<boolean> {
    if (this.running.has(chatId)) return false;
    this.running.add(chatId);
    try {
      for (;;) {
        if (!this.deps.chatExists(chatId)) {
          this.forget(chatId);
          return true;
        }
        const task = (this.tasks.get(chatId) ?? []).find((t) => t.order <= upTo);
        if (!task) return true;
        let result: "done" | "wait" = "done";
        try {
          result = await task.run({ done: this.done.get(chatId) ?? [] });
        } catch (e) {
          this.deps.log?.warn("作業の終わりの予約が失敗しました", e);
        }
        if (result === "wait") return false;
        this.remove(chatId, task);
        this.done.set(chatId, [...(this.done.get(chatId) ?? []), task.kind]);
      }
    } finally {
      this.running.delete(chatId);
    }
  }

  private async runSettling(chatId: number) {
    const last = Math.max(...(this.tasks.get(chatId) ?? []).filter((t) => t.when === "completed").map((t) => t.order), -Infinity);
    if (!(await this.runInOrder(chatId, last))) return;
    if (!this.settling.delete(chatId)) return;
    if (this.deps.runs.peek(chatId)) this.deps.dispatch(chatId, { type: "settled" });
    this.retry();
  }

  private async runRest(chatId: number) {
    await this.runInOrder(chatId, Infinity);
    // 行っている間に作業の終わりを迎えたチャットの予約を続ける
    if (this.settling.size > 0) this.retry();
  }
}
