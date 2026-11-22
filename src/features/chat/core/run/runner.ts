import { RunShell } from "./shell";
import { queueWindow } from "./queueWindow";
import { preparations } from "./preparations";
import { restartResumes } from "./restartResumes";
import { withIdleChat, type IdleChat, type IdleChatOptions } from "./idle";
import { ChatRecovery } from "@/features/chat/core/run/recovery/recovery";
import type { ChatRunState, TurnOutcome } from "@/features/chat/core/run/machine/types";
import { TurnEndTasks, type TurnEndKind, type TurnEndTask } from "@/features/chat/core/turnEnd";
import { recordEvent } from "./record";
import type { StartChatInput } from "@/features/chat/core/input";
import type { ApprovalCenter } from "@/features/chat/core/approvals";
import type { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import type { SessionTrash } from "@/features/chat/core/sessionSwitch";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import type { ChatAttachments, ChatDetachPort, ProviderHandoffPort, ProviderSwitchPort } from "@/features/chat/core/ports";
import type { TurnContributor } from "@/features/chat/core/run/turn/contributor";
import type { AgentProvider, ProviderKeyVault, UsageMonitor } from "@/features/ai/core/index";
import type { TrashCommand } from "@/features/trash/core/index";
import type { McpToolHost } from "@/foundation/core/aiTools/host";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { Bus } from "@/foundation/core/bus";
import { systemClock, type Clock } from "@/foundation/core/clock";
import type { Log } from "@/foundation/core/kernel";
import type { ChatLive, PrepareReason, QueueState } from "@shared/chat/chatLive";
import type { Attachment, Chat, ChatOptionsPatch } from "@shared/chat/types";
import type { SendBody, SendResult } from "@shared/chat/send";
import type { ProviderId } from "@shared/settings/types";
import type { SendOpts } from "./queueWindow";
import { compactPromptFor } from "@shared/chat/prompts";

/** 殻と 1 回の実行が使うもの（createChat が組む。上の機能の口は登録で受ける） */
export interface RunnerDeps {
  /** 時計（省けば本物。作業を始めた時刻・書き直しの持ち時間・行の時刻） */
  clock?: Clock;
  store: Pick<ChatStoreDeps, "chats" | "events" | "outbox" | "settings" | "projects" | "groups" | "aiDefaults">;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  /** 添付の口（保存先・送る文に添付のパスを書き添える。attachments が実装する。なければ添えない） */
  attachments?: ChatAttachments;
  bus?: Bus;
  /** 使用状況の見張り（実行中の支払いの知らせを渡す・使用枠が戻ったかを確かめる） */
  usage: UsageMonitor;
  /**
   * AI に渡す kickoff-trash（rm の代わりに Kickoff のゴミ箱へ入れる。trash/command.ts）。あれば PATH などを渡す（rm・git clean などを断る守りは guard が付ける）。
   * なければ（置けなかった・テスト）渡さない
   */
  trashCommand?: TrashCommand;
  /** 乗り換えた古い会話記録をゴミ箱へ入れる（なければ乗り換えても古い記録は残す） */
  sessionTrash?: SessionTrash;
  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat。殻を作ったあとで provide が渡す。なければそのツールを出さない） */
  chatRemover?: ChatRemover;
  /** コアの MCP サーバー（AI の操作ツールを実行ごとの鍵で出す。なければツールを出さない（テスト）） */
  toolHost?: Pick<McpToolHost, "open">;
  /** 上の機能が出した AI のツールの組（実行ごとに引く。組み立てが全部の機能の CoreFeature.aiTools を集める。chat の組と同じ並びで出す） */
  aiTools?: () => readonly AiToolGroup[];
  /** AI の API キー（設定でログインの仕方を API キーにした AI に渡す。なければいつもサブスク） */
  providerKeys?: ProviderKeyVault;
  /** AI の切り替えの準備と確定（providerSwitch が chat.api.provideProviderSwitch で登録する。なければ切り替えられない） */
  providerSwitch?: ProviderSwitchPort;
  /** AI を替えたあとの引き継ぎの状態（providerSwitch が実装し、組み立てが渡す。なければ引き継ぎはないものとする） */
  providerHandoff?: ProviderHandoffPort;
  /** 子チャットを親から外す口（childChats が chat.api.provideDetach で登録する。なければ AI の update_chat は親から外せない） */
  detach?: ChatDetachPort;
  /** 上の機能が登録した、実行に足すもの（chat.api.addTurnContributor。登録の順に並べ、実行ごとに order の順に集める） */
  contributors?: TurnContributor[];
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
  /** 失敗したときに戻す手順の失敗を書く口（省けば console） */
  log?: Pick<Log, "warn">;
}

/** 殻を作ったあとで受ける口（上の機能が登録するもの・殻を使うもの） */
export type RunnerProvided = Pick<RunnerDeps, "aiTools" | "detach" | "providerSwitch" | "chatRemover">;

/** ほかの機能に出す口（作業中か・作業中の様子・送る・送信待ちを止める・用意して確定する・作業の終わりの予約・作業の始まりと終わりの知らせ） */
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
  /** 作業中でないと確かめてから準備の段階で用意して確定する（失敗なら戻す。idle.ts。作業場所の移動が使う） */
  withIdleChat<T>(chatId: number, why: PrepareReason, action: string, fn: (h: IdleChat) => Promise<T>, opts?: IdleChatOptions): Promise<T>;
  /** 作業の終わりに行う予約（turnEnd.ts） */
  reserveAtTurnEnd(chatId: number, task: TurnEndTask): void;
  cancelTurnEnd(chatId: number, kind: TurnEndKind): TurnEndTask | null;
  hasTurnEnd(chatId: number, kind?: TurnEndKind): boolean;
  reservedFolders(): Set<string>;
  /** 予約した移動のあとの続きの指示を出す箱に置く（止めていて送らないときはお知らせを残す。@shared/chat/outbox の placeContinuation） */
  continuation(chatId: number, text: string, afterFinish: boolean): void;
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
      turnEndTasks: (chatId, _run, effect) => (effect.do === "drop_turn_end_tasks" ? turnEnds.drop(chatId, effect.notice) : turnEnds.settle(chatId)),
      hasTurnEndTasks: (chatId) => turnEnds.hasSettling(chatId),
      becameIdle: () => turnEnds.retry(),
    },
  );
  const window = queueWindow(shell);
  // 作業の終わりに行う予約（ワークツリーの片付け・作業場所の移動・アーカイブ・削除。予約するのは持ち主の機能）
  const turnEnds = new TurnEndTasks({
    runs: shell.runs,
    dispatch: (chatId, event) => void shell.dispatch(chatId, event),
    chatExists: (chatId) => deps.store.chats.get(chatId) !== undefined,
    notice: (chatId, message) => recordEvent(deps.store, shell.runs.get(chatId), { type: "notice", message }),
    log: deps.log,
  });
  shell.onTurnEnded((chatId) => turnEnds.turnEnded(chatId));
  const prep = preparations(shell, turnEnds);
  const restart = restartResumes(shell);
  // チャットを消したときに聞く上の機能（守りの「このチャットでは許可」の覚えを捨てる）
  const forgetHooks: ((chatId: number) => void)[] = [];
  // 1 回の実行に渡すもの（上の機能の口は attach で両方に足す）
  shell.turnDeps = { ...shell.deps };
  shell.recovery = new ChatRecovery({ store: deps.store, approvals: deps.approvals, runs: shell.runs, clock: shell.deps.clock, dispatch: (chatId, event) => shell.dispatch(chatId, event), send: (chatId, text) => window.send(chatId, text), usage: deps.usage, reconnect: deps.reconnect, usageLimit: deps.usageLimit });
  // 前回、AI が指示を受け取る途中でアプリが終了した場合、自動再送せず確認を待つ。
  deps.providerHandoff?.onBoot();
  // 再起動しても送信待ちの列は残す（読み戻した列は止めておく）。作業の途中で止まった・自動で送るまま残ったチャットは、利用者に聞く
  restart.askOnBoot(deps.interrupted ?? []);

  const runner = {
    ...window,
    ...prep,
    restartResumes: restart.restartResumes,
    resolveRestartResumes: restart.resolveRestartResumes,
    isBusy: (chatId: number) => shell.isBusy(chatId),
    requireIdle: (chatId: number, action: string) => shell.requireIdle(chatId, action),
    /** 作業中でないと確かめてから準備の段階で用意して確定する（失敗なら戻す。idle.ts） */
    withIdleChat: <T>(chatId: number, why: PrepareReason, action: string, fn: (h: IdleChat) => Promise<T>, opts?: IdleChatOptions) => withIdleChat(shell, chatId, why, action, fn, opts),
    /** 作業中の様子（チャットの詳細の live。SSE の chat_live と同じ形） */
    live: (chatId: number): ChatLive => shell.runs.live(chatId),
    /** 移り変わる状態（読むだけ。網の筋書きが送る準備・足している途中かを見る） */
    state: (chatId: number): ChatRunState | undefined => shell.runs.peek(chatId)?.run,
    onTurnStarted: (fn: (chatId: number) => void) => shell.onTurnStarted(fn),
    onTurnEnded: (fn: (chatId: number, outcome: TurnOutcome) => void) => shell.onTurnEnded(fn),
    /** 作業の終わりに行う予約（同じ予約は置き換える。作業していなければすぐ試す。turnEnd.ts） */
    reserveAtTurnEnd: (chatId: number, task: TurnEndTask) => turnEnds.reserve(chatId, task),
    cancelTurnEnd: (chatId: number, kind: TurnEndKind): TurnEndTask | null => turnEnds.cancel(chatId, kind),
    hasTurnEnd: (chatId: number, kind?: TurnEndKind) => turnEnds.has(chatId, kind),
    /** 予約で片付けるフォルダ（利用者・AI が作業場所を移す先にできない） */
    reservedFolders: () => turnEnds.reservedFolders(),
    continuation: (chatId: number, text: string, afterFinish: boolean) => void shell.dispatch(chatId, { type: "continuation", text, afterFinish }),

    /**
     * 殻を作ったあとで口を受ける（親から外す・AI の切り替えは上の機能が chat.api.provide… で登録する。アーカイブ・削除は殻を使うので殻のあとで作る。
     * 受けるまでは、その操作を断る・AI にそのツールを出さない）
     */
    provide(given: RunnerProvided) {
      Object.assign(shell.deps, given);
      Object.assign(shell.turnDeps, given);
    },

    /** 止めるよう頼む（Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで、画面は停止ボタンを「停止中…」にする） */
    cancel(chatId: number) {
      shell.dispatch(chatId, { type: "cancel" });
    },

    /** チャットを消したとき: 作業中の状態（送信待ちの列も）を捨て、再開の段取りもやめる */
    forget(chatId: number) {
      if (shell.runs.peek(chatId)) shell.dispatch(chatId, { type: "forget_recovery" });
      turnEnds.forget(chatId);
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
