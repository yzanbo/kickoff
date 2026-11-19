// 仮の機能 legacy: まだ createX に分けていない機能を、いまの起動と同じ順に作る（作る・受け口・始める・止める）。機能を分けるたびにここから外す
import path from "node:path";
import { chatDeltaStage } from "@/features/chat/core/deltaStage";
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { AiApi } from "@/features/ai/core/index";
import type { UploadStore } from "@/features/attachments/core/index";
import type { UserViewRegistry } from "@/features/userView/core/index";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { Runner } from "@/features/chat/core/runner";
import { endInterruptedTurns } from "@/features/chat/core/interruptedTurnEnd";
import { startAutoArchive } from "@/features/chat/core/autoArchive";
import { NoteService } from "@/features/notes/core/notes";
import type { TrashApi } from "@/features/trash/core/index";
import type { DockerService } from "@/features/docker/core/index";
import type { WorktreesApi } from "@/features/worktrees/core/index";
import type { GitHubApi } from "@/features/github/core/index";
import type { TerminalSessions } from "@/features/terminal/core/index";
import { sweepUnusedSessions } from "@/features/chat/core/sessions/sessionTrash";
import type { SessionTrash } from "@/features/chat/core/sessionSwitch";
import { registerProjectTrash } from "@/features/projects/core/trash";
import { RemoteImageService } from "@/features/remoteImages/core/service";
import { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import { registerChatTrash, trashNoteChats, trashNoteChatsOnImport } from "@/features/chat/core/sessions/chatTrash";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import { DbWorkerClient } from "@/features/database/core/client";
import { DatabaseService } from "@/features/database/core/service";
import { DbSecretVault } from "@/features/database/core/secrets";
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
  // AI の kickoff-trash で入れたものは、消したチャットのプロジェクト、なければ元の場所を含むプロジェクト（本体のフォルダは projects、ここはノートのフォルダ）のゴミ箱に出す
  trashBin.addOriginResolver((origin) => store.projects.list().find((p) => (p.note_path || p.note_folder) && isInside(realPathLoose(notes.dirOf(p)), origin))?.id ?? null);
  // AI がノートを kickoff-trash で消したら、ノートのチャットも同じ行に入れる（画面から消したときと同じ）
  trashBin.addImportHook((item) => trashNoteChatsOnImport({ store, runner, noteDirOf: (p) => notes.dirOf(p), publish: (e) => bus.publish(e) }, item));
  const notes = new NoteService({
    store,
    defaultDir: env.notes.defaultDir,
    providers,
    publish: (e) => bus.publish(e),
    trashBin,
    trashNoteChats: (projectId, notePath, itemId) => trashNoteChats({ store, runner }, projectId, notePath, itemId),
  });
  // DB クライアント（DB の処理は別のプロセス。初めて使ったときに起動し、何もしない状態が 5 分続いたら止める。チャットの AI にも DB のツールで読ませる。パスワードはキーチェーンの鍵で暗号化）
  const vault = new DbSecretVault(store, env.secretCipher);
  const databases = new DatabaseService({ store, client: new DbWorkerClient(env.database.worker), vault, dataDir: k.paths.dataDir, appDataRoot: k.paths.appDataRoot, exportRoot: env.database.exportRoot, publish: (e) => bus.publish(e) });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  if (env.database.cleanExports) databases.cleanExports();
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
  const runner = new Runner({ store, approvals, providers, usage, codexCredits, uploads, bus, noteDirOf: (project) => notes.dirOf(project), notes, browser: env.browser, databases, trashCommand, sessionTrash, userViews, bashSandbox, sandboxDiagnostics: env.guard.sandbox ? env.platformParts.sandboxDiagnostics : undefined, toolHost: mcpTools, providerKeys, interrupted: recovered, ...timing });
  // Kickoff が作ったセッションのうち、どのチャットからも使われなくなったものの会話記録を、ゴミ箱の片付けのたびにゴミ箱へ（ほかの Kickoff を調べられないときは片付けない）
  if (sessionsElsewhere) trashBin.addSweepStep(() => sweepUnusedSessions({ store, providers, trashBin, sessionsElsewhere }));
  // ゴミ箱に入れたチャット（チャットの削除・ノートのチャット）を戻す・3 日たったら会話記録のファイル・添付・AI の SQL の CSV ごと本当に消す
  const remoteImages = new RemoteImageService({ store, dir: path.join(k.paths.dataDir, "image-cache"), publish: (e) => bus.publish(e), fetcher: env.remoteImages.fetcher });
  const forgetChatImages = (ids: number[]) => remoteImages.forgetChats(ids);
  registerChatTrash(trashBin, { store, providers, uploads, forgetChatExports: (ids) => databases.forgetChatExports(ids), forgetChatImages, sessionsElsewhere });
  registerProjectTrash(trashBin, { store, providers, uploads, forgetChatExports: (ids) => databases.forgetChatExports(ids), forgetChatImages, sessionsElsewhere });
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
    notes,
    databases,
    remoteImages,
    userViews,
    sessionsElsewhere,
  };
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ。始めるのは待ち受けのあと）
  let stopAutoArchive: (() => void) | null = null;
  // 上の機能の口（ルートは待ち受けの前に登録するので、それまでに attach で受ける）
  let upper: LegacyUpper | null = null;
  const routeDeps = () => {
    if (!upper) throw new Error("組み立ての最後に legacy の attach を呼んでいません");
    const { docker, worktrees, github, terminals } = upper;
    return { ...deps, trashBin, docker, worktreeEnvs: worktrees.envs, worktreeFinisher: worktrees.finisher, prWatch: github.prWatch, githubAccounts: github.accounts, terminals };
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
        runner.attach({ docker: given.docker, worktreeEnvs: given.worktrees.envs, worktreeFinisher: given.worktrees.finisher, terminals: given.terminals });
      },
    },
    ...legacyRoutes(routeDeps),
    start: () => {
      stopAutoArchive = startAutoArchive(store, bus);
    },
    stop: async () => {
      // 止める順（エージェント → 流れ続けている外部コマンド → 見張り・サービス → DB ワーカー → Bash の通信の中継）。通知は先に notifications が止め、
      // 分けた上の機能（Docker・PR の見張り・ワークツリーの後始末・ポート・ターミナルなど）はこのあとに作った順の逆で止まる
      runner.shutdown();
      // 流れ続けている外部コマンド（docker events・起動の途中の up -d など）は聞かずに止める
      k.exec.stopAllStreams();
      chatRemover.close();
      stopAutoArchive?.();
      notes.close();
      await databases.close();
      await relay?.close();
    },
  };
}
