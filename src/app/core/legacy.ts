// 仮の機能 legacy: まだ createX に分けていない機能を、いまの起動と同じ順に作る（作る・受け口・始める・止める）。機能を分けるたびにここから外す
import { chatDeltaStage } from "@/features/chat/core/deltaStage";
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { AiApi } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import type { UserViewRegistry } from "@/features/userView/core/index";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { Runner } from "@/features/chat/core/runner";
import { endInterruptedTurns } from "@/features/chat/core/interruptedTurnEnd";
import { startAutoArchive } from "@/features/chat/core/autoArchive";
import type { TrashApi } from "@/features/trash/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import type { GitHubApi } from "@/features/github/core/index";
import type { TerminalSessions } from "@/features/terminal/core/index";
import type { NoteService } from "@/features/notes/core/index";
import type { DatabaseService } from "@/features/database/core/index";
import type { RemoteImageService } from "@/features/remoteImages/core/index";
import type { BrowserControl } from "@shared/browser/control";
import { sweepUnusedSessions } from "@/features/chat/core/sessions/sessionTrash";
import type { SessionTrash } from "@/features/chat/core/sessionSwitch";
import { registerProjectTrash } from "@/features/projects/core/trash";
import { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import { registerChatTrash, type ChatPurgeDeps } from "@/features/chat/core/sessions/chatTrash";
import type { BashSandboxDeps } from "@/features/guard/core/sandbox/bashSandbox";
import type { RecoveredReason } from "@/foundation/core/host/protocol";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { CoreFeature } from "@/foundation/core/feature";
import type { ServerDeps } from "@/foundation/core/http/server";
import { legacyRoutes } from "./legacyRoutes";
import type { CoreEnv } from "./types";
import type { CorePrepared } from "./prepare";

/** 前のコアの終わり方ごとの、中断したチャットに残す文 */
const RECOVERED_MESSAGES: Record<RecoveredReason, string> = {
  quit: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
  crash: "Kickoff のコアが止まったため中断しました。メッセージを送ると続きから再開できます。",
};

/** ほかの機能と組み立て・テストに出す口（ルートが受ける値・AI の操作ツールの MCP・チャットの削除） */
export interface LegacyApi extends ServerDeps {
  mcpTools: McpToolHost;
  chatRemover: ChatRemover;
  /** 上の機能の口を受ける（上の機能は Runner を使うので legacy のあとに作り、組み立ての最後に 1 回だけ呼ぶ） */
  attach(upper: LegacyUpper): void;
}

/** legacy のあとに作る上の機能の口 */
export interface LegacyUpper {
  docker: DockerService;
  worktrees: WorktreesApi;
  github: GitHubApi;
  terminals: TerminalSessions;
  notes: NoteService;
  databases: DatabaseService;
  remoteImages: RemoteImageService;
  browser: BrowserControl | undefined;
}

/** 分けた下の機能の口 */
export interface LegacyDeps {
  trash: TrashApi;
  ai: AiApi;
  uploads: UploadStore;
  userViews: UserViewRegistry;
}

/** いまの全部の機能を作る（待ち受けを始めたあとの見張りは start、止めるのは stop） */
export function createLegacy(k: KernelWithStore, env: CoreEnv, { trashCommandFile, relay }: CorePrepared, { trash: trashBin, ai, uploads, userViews }: LegacyDeps): CoreFeature<LegacyApi> {
  const { bus, store } = k;
  const deltas = chatDeltaStage(k.clock);
  bus.use(deltas);
  // 前回の終了で作業の途中で止まったチャット（落ちて作業中のまま残ったものを失敗にし、終えるときに印を付けたものと一緒に返す）は、起動したときの再開の確かめで聞く
  const recovered = store.chats.recoverInterrupted(RECOVERED_MESSAGES[env.recoveredReason ?? "quit"]);
  if (recovered.length > 0) k.log.info(`前回の終了で作業の途中で止まったチャットが ${recovered.length} 件あります（起動したときの再開の確かめで聞きます）`);
  // そのうち最後の作業に終わりの記録がないもの（終える・落ちるときに書けなかった）に、終わりの記録と止まったサブエージェントのお知らせを足す
  endInterruptedTurns(store, recovered);

  const { providers, keys: providerKeys, usage, codexCredits } = ai;
  const approvals = new ApprovalCenter(bus);
  // AI の rm の代わりの kickoff-trash（置けていなければ守りも付けない。AI が消せなくなって止まらないように）
  const trashCommand = trashCommandFile ? { path: trashCommandFile, dir: trashBin.dir } : undefined;
  // AI の Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする）。通信はどこへでも通す中継を通す（ネットワークは絞らない。起こせなければプロバイダーの中継のまま）
  const bashSandbox: BashSandboxDeps | undefined = env.guard.sandbox ? { rules: env.platformParts.agentSandbox, proxyPort: relay?.port ?? null, trashDir: trashCommand ? trashCommand.dir : null } : undefined;
  // 製品版と開発版は同じ ~/.claude/projects に会話記録を置く（開発版のデータは製品版から写す）ので、会話記録を片付ける前に、ほかの Kickoff が使っていないか確かめる
  const { sessionsElsewhere: elsewhere, ...timing } = env.chat;
  const sessionsElsewhere = elsewhere ?? undefined;
  // 長いチャットを直近の区切りだけの新しいセッションに乗り換えたら、古い会話記録を Kickoff のゴミ箱（3 日）へ
  const sessionTrash: SessionTrash = async (sessionId, file, { projectId, label }) => {
    if (sessionsElsewhere && sessionsElsewhere([sessionId]).size > 0) return;
    await trashBin.putPath(file, { projectId, label, kind: "session" });
  };
  // AI の操作ツールを実行ごとの鍵で出すコアの MCP サーバー（どの CLI もこの Mac の中から HTTP でつなぐ）
  const mcpTools = new McpToolHost(() => env.mcpBaseUrl);
  const runner = new Runner({ store, approvals, providers, usage, codexCredits, uploads, bus, trashCommand, sessionTrash, userViews, bashSandbox, sandboxDiagnostics: env.guard.sandbox ? env.platformParts.sandboxDiagnostics : undefined, toolHost: mcpTools, providerKeys, interrupted: recovered, ...timing });
  // Kickoff が作ったセッションのうち、どのチャットからも使われなくなったものの会話記録を、ゴミ箱の片付けのたびにゴミ箱へ（ほかの Kickoff を調べられないときは片付けない）
  if (sessionsElsewhere) trashBin.addSweepStep(() => sweepUnusedSessions({ store, providers, trashBin, sessionsElsewhere }));
  // 上の機能の口（ルートは待ち受けの前に登録し、ゴミ箱は本当に消すときに使うので、それまでに attach で受ける）
  let upper: LegacyUpper | null = null;
  const up = () => {
    if (!upper) throw new Error("組み立ての最後に legacy の attach を呼んでいません");
    return upper;
  };
  // ゴミ箱に入れたチャット（チャットの削除・ノートのチャット）を戻す・3 日たったら会話記録のファイル・添付・AI の SQL の CSV・外の画像の覚えごと本当に消す
  const purgeDeps: ChatPurgeDeps = { store, providers, uploads, forgetChatExports: (ids) => up().databases.forgetChatExports(ids), forgetChatImages: (ids) => up().remoteImages.forgetChats(ids), sessionsElsewhere };
  registerChatTrash(trashBin, purgeDeps);
  registerProjectTrash(trashBin, purgeDeps);
  // チャットのアーカイブ・削除（AI の archive_chat・delete_chat。自分・自分の祖先を頼まれたら作業の終わりに行う予約）
  const chatRemover = new ChatRemover({ store, bus, runner, trashBin, retryMs: env.retryMs });
  runner.useChatRemover(chatRemover);
  const deps: ServerDeps = {
    store,
    bus,
    streamingText: deltas.streamingText,
    providers,
    runner,
    approvals,
    uploads,
    userViews,
    sessionsElsewhere,
  };
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ。始めるのは待ち受けのあと）
  let stopAutoArchive: (() => void) | null = null;
  const routeDeps = () => {
    const { docker, worktrees, github, terminals, notes, remoteImages } = up();
    return { ...deps, trashBin, docker, worktreeEnvs: worktrees.envs, worktreeFinisher: worktrees.finisher, prWatch: github.prWatch, githubAccounts: github.accounts, terminals, notes, remoteImages };
  };

  return {
    name: "legacy",
    // エージェントを先に止める（通知のあと・流れ続けている外部コマンドと分けた下の機能より前。中の止める順は stop のとおり）
    stopPhase: "first",
    api: {
      ...deps,
      mcpTools,
      chatRemover,
      attach: (given) => {
        upper = given;
        const { docker, worktrees, terminals, notes, databases, browser } = given;
        runner.attach({ docker, worktreeEnvs: worktrees.envs, worktreeFinisher: worktrees.finisher, terminals, notes, noteDirOf: (project) => notes.dirOf(project), databases, browser });
      },
    },
    ...legacyRoutes(routeDeps),
    start: () => {
      stopAutoArchive = startAutoArchive(store, bus);
    },
    stop: async () => {
      // 止める順（エージェント → 流れ続けている外部コマンド → 削除の予約・自動のアーカイブ → Bash の通信の中継）。通知は先に notifications が止め、
      // 分けた上の機能（ノート・DB ワーカー・Docker・PR の見張り・ワークツリーの後始末・ポート・ターミナルなど）はこのあとに作った順の逆で止まる
      runner.shutdown();
      // 流れ続けている外部コマンド（docker events・起動の途中の up -d など）は聞かずに止める
      k.exec.stopAllStreams();
      chatRemover.close();
      stopAutoArchive?.();
      await relay?.close();
    },
  };
}
