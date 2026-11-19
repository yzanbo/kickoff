// チャットの機能のコアの入口（ほかの機能はここだけを読む）
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { CoreFeature } from "@/foundation/core/feature";
import type { RecoveredReason } from "@/foundation/core/host/protocol";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { AiApi } from "@/features/ai/core/index";
import { registerProjectTrash } from "@/features/projects/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import { ApprovalCenter } from "./approvals";
import { startAutoArchive } from "./autoArchive";
import { chatDeltaStage } from "./deltaStage";
import { endInterruptedTurns } from "./interruptedTurnEnd";
import { Runner } from "./runner";
import { registerChatTrash, type ChatPurgeDeps } from "./sessions/chatTrash";
import { sweepUnusedSessions } from "./sessions/sessionTrash";
import type { SessionsUsedElsewhere } from "./sessions/siblingSessions";
import type { SessionTrash } from "./sessionSwitch";
import { ChatRemover } from "./tools/aiChatRemove";
import type { ExecutionDeps } from "./turn";
import { approvalRoutes } from "./routes/approvals";
import { chatRoutes } from "./routes/chats";
import { queueRoutes } from "./routes/queue";
import { sessionRoutes } from "./routes/sessions";
import { turnRoutes } from "./routes/turns";

export type { Runner } from "./runner";
export { trashNoteChats, trashNoteChatsOnImport } from "./sessions/chatTrash";

/** 前のコアの終わり方ごとの、中断したチャットに残す文 */
const RECOVERED_MESSAGES: Record<RecoveredReason, string> = {
  quit: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
  crash: "Kickoff のコアが止まったため中断しました。メッセージを送ると続きから再開できます。",
};

export interface ChatDeps {
  trash: TrashApi;
  ai: AiApi;
  /** 添付の置き場（attachments の口） */
  uploads: NonNullable<ExecutionDeps["uploads"]>;
  /** 利用者が見ているもの（userView の口） */
  userViews: NonNullable<ExecutionDeps["userViews"]>;
}

export interface ChatEnv extends Pick<NonNullable<ConstructorParameters<typeof Runner>[0]>, "reconnect" | "usageLimit" | "editHoldTtlMs" | "tellableWaitMs"> {
  /** 前のコアの終わり方（作業中のまま残ったチャットを中断にする文を選ぶ。省けばアプリの終了） */
  recoveredReason?: RecoveredReason;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（null は調べない） */
  sessionsElsewhere: SessionsUsedElsewhere | null;
  /** 置いた kickoff-trash（置かなければ、AI に rm の代わりを渡さない） */
  trashCommandFile?: string;
  /** AI の操作ツールの MCP の URL の頭（http://127.0.0.1:<ポート>） */
  mcpBaseUrl: string;
  /** 作業の終わりの予約の確かめ直しの間隔（省けば本物の間隔） */
  retryMs?: number;
}

/** チャットより上の機能の口（上の機能はチャットを使うのであとに作り、組み立ての最後に attach で渡す） */
export interface ChatUpper {
  notes: NonNullable<ExecutionDeps["notes"]>;
  databases: NonNullable<ExecutionDeps["databases"]>;
  docker: NonNullable<ExecutionDeps["docker"]>;
  worktreeEnvs: NonNullable<ExecutionDeps["worktreeEnvs"]>;
  worktreeFinisher: NonNullable<ExecutionDeps["worktreeFinisher"]>;
  terminals: NonNullable<ExecutionDeps["terminals"]>;
  browser: ExecutionDeps["browser"];
  bashSandbox: ExecutionDeps["bashSandbox"];
  sandboxDiagnostics: ExecutionDeps["sandboxDiagnostics"];
  /** 分岐したチャットに外の画像の覚えを写す */
  remoteImages: { copyChat(fromChatId: number, toChatId: number): Promise<void> };
}

export interface ChatApi {
  runner: Runner;
  approvals: ApprovalCenter;
  /** いまの書きかけの返答（チャットの詳細の streaming_text） */
  streamingText(chatId: number): string | null;
  /** AI の操作ツールを実行ごとの鍵で出すコアの MCP サーバー（HTTP の土台の /mcp/<名前>） */
  mcpTools: McpToolHost;
  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat） */
  chatRemover: ChatRemover;
  sessionsElsewhere?: SessionsUsedElsewhere;
  /** 上の機能の口を受ける（組み立ての最後に 1 回だけ。仮の口で、上の機能が実行に足すものを登録する形に替えたら消す） */
  attach(upper: ChatUpper): void;
  /** チャットを本当に消したあとの後片付けを足す（上の機能が登録する。database は AI の SQL の CSV、remoteImages は外の画像の覚えを消す） */
  onChatsPurged(fn: (chatIds: number[]) => void | Promise<void>): void;
}

/** チャットの実行（受付 Runner・承認・起動したときの再開の確かめ・削除の予約・自動のアーカイブ・チャットとプロジェクトのゴミ箱の扱い）。エージェントは先に止める */
export function createChat(k: KernelWithStore, deps: ChatDeps, env: ChatEnv): CoreFeature<ChatApi> {
  const { bus, store } = k;
  const { trash: trashBin, uploads, userViews } = deps;
  const { providers, keys: providerKeys, usage, codexCredits } = deps.ai;
  const deltas = chatDeltaStage(k.clock);
  bus.use(deltas);
  // 前回の終了で作業の途中で止まったチャット（落ちて作業中のまま残ったものを失敗にし、終えるときに印を付けたものと一緒に返す）は、起動したときの再開の確かめで聞く
  const recovered = store.chats.recoverInterrupted(RECOVERED_MESSAGES[env.recoveredReason ?? "quit"]);
  if (recovered.length > 0) k.log.info(`前回の終了で作業の途中で止まったチャットが ${recovered.length} 件あります（起動したときの再開の確かめで聞きます）`);
  // そのうち最後の作業に終わりの記録がないもの（終える・落ちるときに書けなかった）に、終わりの記録と止まったサブエージェントのお知らせを足す
  endInterruptedTurns(store, recovered);
  const approvals = new ApprovalCenter(bus);
  // AI の rm の代わりの kickoff-trash（置けていなければ守りも付けない。AI が消せなくなって止まらないように）
  const trashCommand = env.trashCommandFile ? { path: env.trashCommandFile, dir: trashBin.dir } : undefined;
  const { recoveredReason: _reason, sessionsElsewhere: elsewhere, trashCommandFile: _file, mcpBaseUrl, retryMs, ...timing } = env;
  const sessionsElsewhere = elsewhere ?? undefined;
  // 長いチャットを直近の区切りだけの新しいセッションに乗り換えたら、古い会話記録を Kickoff のゴミ箱（3 日）へ
  const sessionTrash: SessionTrash = async (sessionId, file, { projectId, label }) => {
    if (sessionsElsewhere && sessionsElsewhere([sessionId]).size > 0) return;
    await trashBin.putPath(file, { projectId, label, kind: "session" });
  };
  // AI の操作ツールを実行ごとの鍵で出すコアの MCP サーバー（どの CLI もこの Mac の中から HTTP でつなぐ）
  const mcpTools = new McpToolHost(() => mcpBaseUrl);
  const runner = new Runner({ store, approvals, providers, usage, codexCredits, uploads, bus, trashCommand, sessionTrash, userViews, toolHost: mcpTools, providerKeys, interrupted: recovered, ...timing });
  // Kickoff が作ったセッションのうち、どのチャットからも使われなくなったものの会話記録を、ゴミ箱の片付けのたびにゴミ箱へ（ほかの Kickoff を調べられないときは片付けない）
  if (sessionsElsewhere) trashBin.addSweepStep(() => sweepUnusedSessions({ store, providers, trashBin, sessionsElsewhere }));
  // ゴミ箱に入れたチャット（チャットの削除・ノートのチャット）とプロジェクトを戻す・3 日たったら会話記録のファイル・添付と、上の機能が登録したものごと本当に消す
  const purged: ((chatIds: number[]) => void | Promise<void>)[] = [];
  const purgeDeps: ChatPurgeDeps = {
    store,
    providers,
    uploads,
    sessionsElsewhere,
    // 1 つが失敗してもほかの後片付けは続ける
    onPurged: async (ids) => {
      for (const fn of purged) await Promise.resolve().then(() => fn(ids)).catch(() => {});
    },
  };
  registerChatTrash(trashBin, purgeDeps);
  registerProjectTrash(trashBin, purgeDeps);
  // チャットのアーカイブ・削除（自分・自分の祖先を頼まれたら作業の終わりに行う予約）
  const chatRemover = new ChatRemover({ store, bus, runner, trashBin, retryMs });
  runner.useChatRemover(chatRemover);
  // 上の機能の口（ルートは待ち受けの前に登録するので、それまでに attach で受ける）
  let upper: ChatUpper | null = null;
  const routeDeps = () => {
    if (!upper) throw new Error("組み立ての最後に chat の attach を呼んでいません");
    const { worktreeEnvs, worktreeFinisher, terminals, remoteImages } = upper;
    return { store, bus, streamingText: deltas.streamingText, providers, runner, approvals, uploads, userViews, sessionsElsewhere, trashBin, worktreeEnvs, worktreeFinisher, terminals, remoteImages };
  };
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ。始めるのは待ち受けのあと）
  let stopAutoArchive: (() => void) | null = null;
  return {
    name: "chat",
    // エージェントを先に止める（通知のあと・流れ続けている外部コマンドとほかの機能より前）
    stopPhase: "first",
    api: {
      runner,
      approvals,
      streamingText: deltas.streamingText,
      mcpTools,
      chatRemover,
      sessionsElsewhere,
      attach: (given) => {
        upper = given;
        const { remoteImages: _images, notes, ...rest } = given;
        runner.attach({ ...rest, notes, noteDirOf: (project) => notes.dirOf(project) });
      },
      onChatsPurged: (fn) => void purged.push(fn),
    },
    routes: [
      {
        legacy: (app) => {
          const r = routeDeps();
          chatRoutes(app, r);
          turnRoutes(app, r);
          queueRoutes(app, r);
          sessionRoutes(app, r);
          approvalRoutes(app, r);
        },
      },
    ],
    start: () => {
      stopAutoArchive = startAutoArchive(store, bus);
    },
    stop: () => {
      // エージェント → 流れ続けている外部コマンド（docker events・起動の途中の up -d など。聞かずに止める）→ 削除の予約・自動のアーカイブ
      runner.shutdown();
      k.exec.stopAllStreams();
      chatRemover.close();
      stopAutoArchive?.();
    },
  };
}
