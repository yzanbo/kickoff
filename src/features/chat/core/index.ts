// チャットの機能のコアの入口（ほかの機能はここだけを読む）
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { CoreFeature } from "@/foundation/core/feature";
import type { RecoveredReason } from "@/foundation/core/host/protocol";
import type { Kernel } from "@/foundation/core/kernel";
import type { AiApi } from "@/features/ai/core/index";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { TrashApi } from "@/features/trash/core/index";
import { ApprovalCenter } from "./approvals";
import { startAutoArchive } from "./autoArchive";
import { chatTitlesOf } from "./db/chatTitles";
import { chatDeltaStage } from "./deltaStage";
import { endInterruptedTurns } from "./interruptedTurnEnd";
import { Runner } from "./runner";
import { registerChatTrash, type ChatPurgeDeps } from "./sessions/chatTrash";
import { registerProjectTrash } from "./sessions/projectTrash";
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
import { databaseStats } from "./db/stats";
import type { DatabaseStats } from "@shared/chat/databaseStats";
import { createChatStores, type Store } from "./stores";
import type { GroupsApi } from "@/features/groups/core/index";

export type { Runner } from "./runner";
export type { Store } from "./stores";
export { trashNoteChats, trashNoteChatsOnImport } from "./sessions/chatTrash";

/** 前のコアの終わり方ごとの、中断したチャットに残す文 */
const RECOVERED_MESSAGES: Record<RecoveredReason, string> = {
  quit: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
  crash: "Kickoff のコアが止まったため中断しました。メッセージを送ると続きから再開できます。",
};

export interface ChatDeps {
  trash: TrashApi;
  projects: ProjectsApi;
  groups: GroupsApi;
  /** 定型文に足す（AI の add_snippet。上の snippets の店を組み立てが渡す） */
  snippets: Store["snippets"];
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
  /** 全部の機能が出した AI のツールの組（CoreFeature.aiTools） */
  aiTools: NonNullable<ExecutionDeps["aiTools"]>;
}

export interface ChatApi {
  /** chat の店の束（仮の形。上の機能がチャット・記録を読む） */
  store: Store;
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
  /** チャットの名前をまとめて引く（ゴミ箱のチャットも。もうないチャットは入れない） */
  titlesOf(ids: readonly number[]): Map<number, string>;
  /** 性能の記録（診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  stats(): DatabaseStats;
}

/** チャットの実行（受付 Runner・承認・起動したときの再開の確かめ・削除の予約・自動のアーカイブ・チャットとプロジェクトのゴミ箱の扱い）。エージェントは先に止める */
export function createChat(k: Kernel, deps: ChatDeps, env: ChatEnv): CoreFeature<ChatApi> {
  const { bus } = k;
  const store: Store = { ...createChatStores(k.db, (e) => bus.publish(e), k.settings), db: k.db, settings: k.settings, projects: deps.projects.store, groups: deps.groups.store, trash: deps.trash.items, snippets: deps.snippets };
  // グループを消したら、中のチャットをグループなしに戻して知らせる
  deps.groups.useMembers({
    idsIn: (group) => store.chats.list({ projectId: group.project_id, includeArchived: true }).flatMap((c) => (c.group_id === group.id ? [c.id] : [])),
    getChat: store.chats.get,
  });
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
  // ゴミ箱が読むチャット（消したチャットの名前・AI の kickoff-trash で入れたものを出すプロジェクト）
  const titlesOf = chatTitlesOf(k.db);
  trashBin.useChats({ titlesOf, projectOf: (chatId) => store.chats.get(chatId)?.project_id ?? null });
  registerProjectHooks(deps.projects, store, runner);
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
      store,
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
      titlesOf,
      stats: () => databaseStats(k.db, k.db.location()),
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
      // エージェント → 削除の予約・自動のアーカイブ（流れ続けている外部コマンドは、このあと土台が聞かずに止める）
      runner.shutdown();
      chatRemover.close();
      stopAutoArchive?.();
    },
  };
}

/** プロジェクトの口に、チャットの分を登録する（作業中か・本体のフォルダを変えたら作業場所を移す・ゴミ箱に入れたら作業中の状態を捨てる） */
function registerProjectHooks(projects: ProjectsApi, store: Store, runner: Runner): void {
  projects.addBusyCheck((projectId) => store.chats.list({ projectId, includeArchived: true }).some((chat) => runner.isBusy(chat.id)));
  projects.afterRepoMove(async (project, moves) => {
    const chats = store.chats.list({ projectId: project.id, includeArchived: true });
    // 作業フォルダが変わるので、作業場所を移すのと同じく、会話を新しいセッションに写して区切りを置く（本体のチャットも）
    for (const chat of chats) {
      const to = chat.worktree_path ? (moves.get(chat.worktree_path) ?? null) : null;
      await runner.moveWorkplace(chat.id, { worktreePath: to, reason: "folder_moved", fromDir: chat.worktree_path ?? project.repo_path });
    }
    // ゴミ箱にあるチャットも付け替える（戻したときに消えた作業場所を指さないように）
    const used = new Set(chats.flatMap((chat) => (chat.worktree_path ? [chat.worktree_path] : [])));
    for (const from of used) store.chats.replaceWorktree(project.id, from, moves.get(from) ?? null);
  });
  // プロジェクトをゴミ箱に入れたら、中のチャット（アーカイブ・子孫も）を同じ行で入れる（戻すと一緒に戻る）
  projects.onTrashed((project, trashId, at) => {
    const chats = store.chats.list({ projectId: project.id, includeArchived: true });
    const ids = [...new Set(chats.flatMap((chat) => [chat.id, ...store.chats.descendants(chat.id).map((c) => c.id)]))];
    store.chats.trash(ids, trashId, at);
    for (const id of ids) runner.forget(id);
  });
}
