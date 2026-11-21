import type { ExecutionDeps, ShellUpperDeps } from "@/features/chat/core/turn";
import { RunShell } from "./shell";
import { queueWindow } from "./queueWindow";
import { preparations } from "./preparations";
import { restartResumes } from "./restartResumes";
import { ChatRecovery } from "@/features/chat/core/run/recovery/recovery";
import type { ChatRunState, TurnOutcome } from "@/features/chat/core/run/machine/types";
import { WorkplaceReservations, type WorkplaceMoveInput, type WorkplaceMovePlan, type WorkplaceMoveSteps } from "@/features/chat/core/runner";
import type { StartChatInput } from "@/features/chat/core/input";
import type { UsageMonitor } from "@/features/ai/core/index";
import { systemClock, type Clock } from "@/foundation/core/clock";
import type { ChatLive, QueueState } from "@shared/chat/chatLive";
import type { Attachment, Chat, ChatOptionsPatch } from "@shared/chat/types";
import type { SendBody, SendResult } from "@shared/chat/send";
import type { SendOpts } from "./queueWindow";
import { compactPromptFor } from "@shared/chat/prompts";

/** 殻を組み立てるのに使うもの */
export type RunnerDeps = ExecutionDeps & ShellUpperDeps & {
  usage: UsageMonitor;
  /** 時計（省けば本物。書き直しの持ち時間・行の時刻） */
  clock?: Clock;
  /** つながったかの確かめ方と間隔（テストで差し替える） */
  reconnect?: { check?: (url: string) => Promise<boolean>; intervalMs?: number };
  /** 使用枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
  usageLimit?: { now?: () => number; checkMs?: number };
  /** 書き直している印の持ち時間（テストで差し替える） */
  editHoldTtlMs?: number;
  /** 前回の終了で作業の途中で止まったチャット（store.chats.recoverInterrupted が返す印のあるもの。起動したときの再開の確かめで「続ける」を選べる） */
  interrupted?: number[];
  /** 出来事・変わった項目・命令を 1 行ずつ書く口（KICKOFF_RUN_TRACE=1 のとき） */
  trace?: (line: string) => void;
};

/** ほかの機能に出す口（作業中か・作業中の様子・送る・送信待ちを止める・作業場所を移す・作業の始まりと終わりの知らせ） */
export interface ChatRunPort {
  isBusy(chatId: number): boolean;
  requireIdle(chatId: number, action: string): void;
  live(chatId: number): ChatLive;
  queueState(chatId: number): QueueState;
  start(input: StartChatInput): Promise<Chat>;
  /** 送る口 1 本（when: now = 止めずに伝える / later = 作業中なら送信待ちへ / 省けば作業中は 409） */
  message(chatId: number, body: SendBody): Promise<SendResult>;
  send(chatId: number, text: string, options?: ChatOptionsPatch, attachments?: Attachment[], opts?: SendOpts): Promise<Chat>;
  setQueuePaused(chatId: number, paused: boolean): Promise<boolean>;
  moveWorkplace(chatId: number, input: WorkplaceMoveInput, steps?: WorkplaceMoveSteps): Promise<Chat>;
  forget(chatId: number): void;
  /** 作業を動かし始めた・1 回の実行が終わった（作業の終わりにすることより前。やめる関数を返す） */
  onTurnStarted(fn: (chatId: number) => void): () => void;
  onTurnEnded(fn: (chatId: number, outcome: TurnOutcome) => void): () => void;
}

/**
 * チャットの実行の殻 ChatRunner を組み立てる。送った指示はすぐ動かす（同時に動かす数は決めない）。1 つのチャットは 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * 操作も知らせも出来事（RunEvent）にして殻の dispatch に渡し、次の状態と命令は純粋な step（machine/step.ts）が決める。殻（shell.ts）は命令を実行するだけ。
 * 窓口は送る・送信待ち（queueWindow.ts）・長い準備と作業の終わりにすること（preparations.ts）・起動したときの再開の確かめ（restartResumes.ts）に分ける
 */
export function createChatRunner(deps: RunnerDeps) {
  const shell = new RunShell(
    { ...deps, clock: deps.clock ?? systemClock },
    {
      preCompactOf: (projectId) => {
        const project = deps.store.projects.get(projectId);
        return project ? compactPromptFor("pre", deps.store.settings.get(), project) : null;
      },
      turnEndTasks: (chatId, run, effect) => prep.turnEndTasks(chatId, run, effect),
    },
  );
  const window = queueWindow(shell);
  // AI が作業場所を移す予約（作業が最後まで終わったら移す）
  const workplaceMoves = new WorkplaceReservations(shell.runs);
  const prep = preparations(shell, workplaceMoves);
  const restart = restartResumes(shell);
  // チャットを消したときに聞く上の機能（守りの「このチャットでは許可」の覚えを捨てる）
  const forgetHooks: ((chatId: number) => void)[] = [];
  // 1 回の実行に渡すもの（AI の update_chat が作業中の子チャットを外すのを断るため、作業中かの口を足す）
  shell.turnDeps = { ...shell.deps, isBusy: (chatId) => shell.isBusy(chatId) };
  shell.recovery = new ChatRecovery({ store: deps.store, approvals: deps.approvals, runs: shell.runs, clock: shell.deps.clock, dispatch: (chatId, event) => shell.dispatch(chatId, event), send: (chatId, text) => window.send(chatId, text), usage: deps.usage, reconnect: deps.reconnect, usageLimit: deps.usageLimit });
  // 前回、AI が指示を受け取る途中でアプリが終了した場合、自動再送せず確認を待つ。
  deps.store.chatProviderHandoffs.recoverInterrupted();
  // 再起動しても送信待ちの列は残す（読み戻した列は止めておく）。作業の途中で止まった・自動で送るまま残ったチャットは、利用者に聞く
  restart.askOnBoot(deps.interrupted ?? []);

  const runner = {
    ...window,
    ...prep,
    restartResumes: restart.restartResumes,
    resolveRestartResumes: restart.resolveRestartResumes,
    isBusy: (chatId: number) => shell.isBusy(chatId),
    requireIdle: (chatId: number, action: string) => shell.requireIdle(chatId, action),
    /** 作業中の様子（チャットの詳細の live。SSE の chat_live と同じ形） */
    live: (chatId: number): ChatLive => shell.runs.live(chatId),
    /** 移り変わる状態（読むだけ。網の筋書きが送る準備・足している途中かを見る） */
    state: (chatId: number): ChatRunState | undefined => shell.runs.peek(chatId)?.run,
    onTurnStarted: (fn: (chatId: number) => void) => shell.onTurnStarted(fn),
    onTurnEnded: (fn: (chatId: number, outcome: TurnOutcome) => void) => shell.onTurnEnded(fn),
    /** AI が作業場所を移す予約（作業が最後まで終わったら移す。workplaceMove の move_workplace が使う） */
    workplaceMoves: {
      reserve: (chatId: number, plan: WorkplaceMovePlan) => workplaceMoves.reserve(chatId, plan),
      cancel: (chatId: number) => workplaceMoves.cancel(chatId) !== null,
    },

    /** 上の機能の口（DB・ワークツリーの実行環境と後始末・内蔵ターミナル・ブラウザ・AI のツールの組）を渡す。上の機能は殻を使うので、組み立ての最後に渡す（渡すまでは AI にそのツールを出さない） */
    attach(upper: Pick<ExecutionDeps, "databases" | "terminals" | "browser" | "aiTools"> & ShellUpperDeps) {
      Object.assign(shell.deps, upper);
      Object.assign(shell.turnDeps, upper);
    },

    /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat の中身）を渡す。作業中か・送信待ちを止めるのに殻を使うので、殻を作ったあとで渡す */
    useChatRemover(remover: NonNullable<ExecutionDeps["chatRemover"]>) {
      shell.turnDeps.chatRemover = remover;
    },

    /** 止めるよう頼む（Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで、画面は停止ボタンを「停止中…」にする） */
    cancel(chatId: number) {
      shell.dispatch(chatId, { type: "cancel" });
    },

    /** チャットを消したとき: 作業中の状態（送信待ちの列も）を捨て、再開の段取りもやめる */
    forget(chatId: number) {
      if (shell.runs.peek(chatId)) shell.dispatch(chatId, { type: "forget_recovery" });
      shell.forget(chatId);
      for (const fn of forgetHooks) fn(chatId);
    },

    /** チャットを消したときに聞く（作業中の状態を捨てたあと） */
    onForget(fn: (chatId: number) => void) {
      forgetHooks.push(fn);
    },

    /** 作業中のチャット（送る準備・親の会話を写している途中も。ID の順） */
    busyChats(): { id: number; title: string | null }[] {
      return shell.runs
        .all()
        .filter((r) => r.busy)
        .map((r) => deps.store.chats.get(r.chatId))
        .filter((c): c is Chat => c !== undefined)
        .map((c) => ({ id: c.id, title: c.title }))
        .sort((a, b) => a.id - b.id);
    },

    /** 実行中のエージェントの数（接続の詳細の表示用） */
    stats: (): { running: number } => ({ running: shell.runs.running().length }),

    /**
     * アプリ終了時: 実行中のエージェントをすべて止める。止める前に、作業中（送る準備・親の会話を写している途中も）と、
     * 通信の切断でつながるのを待っていたチャットに起動したときの再開の確かめの印を付ける（止めると中断で終わり、作業中のまま残らないため。
     * 使用枠の上限を待っていたものは付けない = 戻る時刻が分かれば、そのとき聞く）
     */
    shutdown() {
      shell.shuttingDown = true;
      const stopped = shell.runs.all().filter((r) => r.busy).map((r) => r.chatId);
      deps.store.chats.setResumePending([...new Set([...stopped, ...shell.recovery.waitingForReconnect()])], true);
      shell.recovery.shutdown();
      for (const run of shell.runs.running()) run.handle?.abort.abort();
    },
  };
  return runner satisfies ChatRunPort;
}

/** チャットの実行の殻（窓口の全部。ほかの機能は ChatRunPort だけを受ける） */
export type ChatRunner = ReturnType<typeof createChatRunner>;
