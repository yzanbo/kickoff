// チャットの機能のコアの入口（ほかの機能はここだけを読む）
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { Caller } from "@/foundation/core/http/caller";
import { idParam, type Param } from "@/foundation/core/http/implement";
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
import { endInterruptedTurns } from "./run/turn/result";
import { createChatRunner, type ChatRunner, type RunnerDeps } from "./run/runner";
import { registerChatTrash, type ChatPurgeDeps } from "./sessions/chatTrash";
import { registerProjectTrash } from "./sessions/projectTrash";
import { sweepUnusedSessions } from "./sessions/sessionTrash";
import type { SessionsUsedElsewhere, SiblingSessionCheck } from "./sessions/siblingSessions";
import type { SessionTrash } from "./sessionSwitch";
import { ChatRemover } from "./tools/aiChatRemove";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { TurnContributor } from "./run/turn/contributor";
import type { ChatAttachments, ChatDetachPort, ProviderHandoffPort, ProviderSwitchPort } from "./ports";
import { approvalRoutes } from "./routes/approvals";
import { chatRoutes } from "./routes/chats";
import { queueRoutes } from "./routes/queue";
import { archiveCleanupRoutes, orphanSessionRoutes } from "./routes/sessions";
import { turnRoutes } from "./routes/turns";
import { databaseStats } from "./db/stats";
import type { DatabaseStats } from "@shared/chat/databaseStats";
import type { Chat } from "@shared/chat/types";
import { createChatStores, type Store } from "./stores";
import { descendantsOf } from "./family";
import type { GroupsApi } from "@/features/groups/core/index";

export type { ChatRunner, ChatRunPort } from "./run/runner";
export type { TurnEndTask } from "./turnEnd";
export type { TurnContributor } from "./run/turn/contributor";
export type { PromptSection } from "./prompt/sections";
export { appendSections } from "./prompt/compose";
export { readOnlyReferences } from "./turnFolders";
export { preCompactSent } from "./run/machine/marks";
export { depthOf, descendantsOf, lineageOf } from "./family";
export { openPlaceInput } from "./tools/open";
export { toolChat } from "./tools/context";
export { workdirOf } from "./workdir";
export { forkFrom, resumePointBefore } from "./sessionPoints";
export { replaceSession, type SessionTrash } from "./sessionSwitch";
export type { ChatAttachments, ChatDetachPort, ProviderHandoffPort, ProviderSwitchPort } from "./ports";
export type { ChatStores, Store } from "./stores";
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
  /** 添付の口（保存先・送る文と回答に添付のパスを書き添える・消したチャットの添付を消す。attachments が実装する） */
  attachments: ChatAttachments;
  /** AI を替えたあとの引き継ぎの状態（providerSwitch の createProviderHandoffs。起動したときの確かめがこの中で走るので、組み立てが先に作って渡す） */
  providerHandoff: ProviderHandoffPort;
  /** 全部の機能が出した AI のツールの組（CoreFeature.aiTools。実行ごとに引く。組み立てが集める） */
  aiTools: () => readonly AiToolGroup[];
}

export interface ChatEnv extends Pick<RunnerDeps, "reconnect" | "usageLimit" | "editHoldTtlMs"> {
  /** 前のコアの終わり方（作業中のまま残ったチャットを中断にする文を選ぶ。省けばアプリの終了） */
  recoveredReason?: RecoveredReason;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（null は調べない） */
  sessionsElsewhere: SiblingSessionCheck | null;
  /** 置いた kickoff-trash（置かなければ、AI に rm の代わりを渡さない） */
  trashCommandFile?: string;
  /** AI の操作ツールの MCP の URL の頭（http://127.0.0.1:<ポート>） */
  mcpBaseUrl: string;
}

export interface ChatApi {
  /** chat の店の束（仮の形。上の機能がチャット・記録を読む） */
  store: Store;
  runner: ChatRunner;
  approvals: ApprovalCenter;
  /** いまの書きかけの返答（チャットの詳細の streaming_text） */
  streamingText(chatId: number): string | null;
  /** AI の操作ツールを実行ごとの鍵で出すコアの MCP サーバー（HTTP の土台の /mcp/<名前>） */
  mcpTools: McpToolHost;
  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat） */
  chatRemover: ChatRemover;
  sessionsElsewhere?: SessionsUsedElsewhere;
  /** 乗り換えた古い会話記録をゴミ箱へ入れる（ほかの Kickoff が使っていれば入れない。作業場所を移すときも） */
  sessionTrash: SessionTrash;
  /** 子チャットを親から外す口を受ける（childChats が createChildChats の中で登録する。AI の update_chat の parent_id） */
  provideDetach(port: ChatDetachPort): void;
  /** AI の切り替えの準備と確定を受ける（providerSwitch が createProviderSwitch の中で登録する） */
  provideProviderSwitch(port: ProviderSwitchPort): void;
  /** 実行に足すもの（環境変数・フォルダ・システムプロンプトの節・添える文脈・作業の終わりにすること）を登録する（上の機能が createX の中で呼ぶ。AI のツールは CoreFeature.aiTools） */
  addTurnContributor(c: TurnContributor): void;
  /** チャットを消したとき（作業中の状態を捨てたあと。上の機能がチャットごとの覚えを捨てる） */
  onForget(fn: (chatId: number) => void): void;
  /** 送る指示を受けたとき（本文の user_view はそのまま渡す。形を確かめるのは聞く側。fromHost = この Mac の画面から送った） */
  onUserSend(fn: (chatId: number, extras: { user_view: unknown; fromHost: boolean }) => void): void;
  /** チャットを本当に消したあとの後片付けを足す（上の機能が登録する。database は AI の SQL の CSV、remoteImages は外の画像の覚えを消す） */
  onChatsPurged(fn: (chatIds: number[]) => void | Promise<void>): void;
  /** ルートの :chatId の引き当て（番号でなければ 400・なければ 404「チャットが見つかりません」。ゴミ箱のチャットは見えない） */
  chatParam: Param<Chat>;
  /** チャットの名前をまとめて引く（ゴミ箱のチャットも。もうないチャットは入れない） */
  titlesOf(ids: readonly number[]): Map<number, string>;
  /** 性能の記録（診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  stats(): DatabaseStats;
}

/** チャットの実行（殻 ChatRunner・承認・起動したときの再開の確かめ・削除の予約・自動のアーカイブ・チャットとプロジェクトのゴミ箱の扱い）。エージェントは先に止める */
export function createChat(k: Kernel, deps: ChatDeps, env: ChatEnv): CoreFeature<ChatApi> {
  const { bus } = k;
  const store: Store = { ...createChatStores(k.db, (e) => bus.publish(e), k.settings, deps.providerHandoff.rememberedSessions), db: k.db, settings: k.settings, projects: deps.projects.store, groups: deps.groups.store, trash: deps.trash.items, snippets: deps.snippets };
  // グループを消したら、中のチャットをグループなしに戻して知らせる
  deps.groups.useMembers({
    idsIn: (group) => store.chats.list({ projectId: group.project_id, includeArchived: true }).flatMap((c) => (c.group_id === group.id ? [c.id] : [])),
    getChat: store.chats.get,
  });
  const { trash: trashBin, attachments } = deps;
  const { providers, keys: providerKeys, usage } = deps.ai;
  const deltas = chatDeltaStage(k.clock);
  bus.use(deltas);
  // 前回の終了で作業の途中で止まったチャット（落ちて作業中のまま残ったものを失敗にし、終えるときに印を付けたものと一緒に返す）は、起動したときの再開の確かめで聞く
  const recovered = store.chats.recoverInterrupted(RECOVERED_MESSAGES[env.recoveredReason ?? "quit"]);
  if (recovered.length > 0) k.log.info(`前回の終了で作業の途中で止まったチャットが ${recovered.length} 件あります（起動したときの再開の確かめで聞きます）`);
  // そのうち最後の作業に終わりの記録がないもの（終える・落ちるときに書けなかった）に、終わりの記録と止まったサブエージェントのお知らせを足す
  endInterruptedTurns(store, recovered);
  const approvals = new ApprovalCenter(bus, k.clock);
  // AI の rm の代わりの kickoff-trash（置けていなければ守りも付けない。AI が消せなくなって止まらないように）
  const trashCommand = env.trashCommandFile ? { path: env.trashCommandFile, dir: trashBin.dir } : undefined;
  const { recoveredReason: _reason, sessionsElsewhere: elsewhere, trashCommandFile: _file, mcpBaseUrl, ...timing } = env;
  // ほかの Kickoff の DB でも、離れた AI のセッションの覚えを使っているものに数える
  const sessionsElsewhere: SessionsUsedElsewhere | undefined = elsewhere ? (ids) => elsewhere(ids, deps.providerHandoff.rememberedSessions) : undefined;
  // 長いチャットを直近の区切りだけの新しいセッションに乗り換えたら、古い会話記録を Kickoff のゴミ箱（3 日）へ
  const sessionTrash: SessionTrash = async (sessionId, file, { projectId, label }) => {
    if (sessionsElsewhere && sessionsElsewhere([sessionId]).size > 0) return;
    await trashBin.putPath(file, { projectId, label, kind: "session" });
  };
  // AI の操作ツールを実行ごとの鍵で出すコアの MCP サーバー（どの CLI もこの Mac の中から HTTP でつなぐ）
  const mcpTools = new McpToolHost(() => mcpBaseUrl);
  // KICKOFF_RUN_TRACE=1 なら、実行の出来事・変わった項目・命令を 1 行ずつログに書く
  const trace = process.env.KICKOFF_RUN_TRACE === "1" ? (line: string) => k.log.info(`[run] ${line}`) : undefined;
  // 上の機能が登録した、実行に足すもの（組み立ての順 = 登録の順。実行ごとに order の順に集める）
  const contributors: TurnContributor[] = [];
  const runner = createChatRunner({ store, approvals, providers, usage, attachments, aiTools: deps.aiTools, providerHandoff: deps.providerHandoff, bus, trashCommand, sessionTrash, toolHost: mcpTools, providerKeys, contributors, interrupted: recovered, clock: k.clock, trace, log: k.log, ...timing });
  // Kickoff が作ったセッションのうち、どのチャットからも使われなくなったものの会話記録を、ゴミ箱の片付けのたびにゴミ箱へ（ほかの Kickoff を調べられないときは片付けない）
  if (sessionsElsewhere) trashBin.addSweepStep(() => sweepUnusedSessions({ store, providers, trashBin, sessionsElsewhere }));
  // ゴミ箱に入れたチャット（チャットの削除・ノートのチャット）とプロジェクトを戻す・3 日たったら会話記録のファイル・添付と、上の機能が登録したものごと本当に消す
  const purged: ((chatIds: number[]) => void | Promise<void>)[] = [];
  const purgeDeps: ChatPurgeDeps = {
    store,
    providers,
    attachments,
    remembered: deps.providerHandoff.sessionsOf,
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
  const chatRemover = new ChatRemover({ store, runner, trashBin });
  runner.provide({ chatRemover });
  // 送る指示を受けたときに聞く上の機能（userView が送った時点の画面の様子を覚える）
  const sendHooks: ((chatId: number, extras: { user_view: unknown; fromHost: boolean }) => void)[] = [];
  const userSent = (caller: Caller, chatId: number, userView: unknown) => {
    const extras = { user_view: userView, fromHost: caller.kind === "host" };
    for (const fn of sendHooks) fn(chatId, extras);
  };
  const chatParam = idParam((id) => store.chats.get(id), "チャットが見つかりません");
  const routeDeps = { store, bus, streamingText: deltas.streamingText, providers, runner, approvals, attachments, providerHandoff: deps.providerHandoff, userSent, sessionsElsewhere, trashBin, workplace: k.workplace, chatParam, projectParam: deps.projects.param };
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
      sessionTrash,
      provideDetach: (port) => runner.provide({ detach: port }),
      provideProviderSwitch: (port) => runner.provide({ providerSwitch: port }),
      addTurnContributor: (c) => void contributors.push(c),
      onForget: (fn) => runner.onForget(fn),
      onUserSend: (fn) => void sendHooks.push(fn),
      onChatsPurged: (fn) => void purged.push(fn),
      titlesOf,
      chatParam,
      stats: () => databaseStats(k.db, k.db.location()),
    },
    routes: [
      chatRoutes(routeDeps),
      turnRoutes(routeDeps),
      queueRoutes(routeDeps),
      approvalRoutes(routeDeps),
      archiveCleanupRoutes(routeDeps),
      { legacy: (app) => orphanSessionRoutes(app, routeDeps) },
    ],
    start: () => {
      stopAutoArchive = startAutoArchive(store, bus, k.clock);
    },
    stop: () => {
      // エージェント → 削除の予約・自動のアーカイブ（流れ続けている外部コマンドは、このあと土台が聞かずに止める）
      runner.shutdown();
      stopAutoArchive?.();
    },
  };
}

/** プロジェクトの口に、チャットの分を登録する（作業中か・ゴミ箱に入れたら作業中の状態を捨てる。本体のフォルダを変えたら作業場所を移すのは workplaceMove） */
function registerProjectHooks(projects: ProjectsApi, store: Store, runner: ChatRunner): void {
  projects.addBusyCheck((projectId) => store.chats.list({ projectId, includeArchived: true }).some((chat) => runner.isBusy(chat.id)));
  // プロジェクトをゴミ箱に入れたら、中のチャット（アーカイブ・子孫も）を同じ行で入れる（戻すと一緒に戻る）
  projects.onTrashed((project, trashId, at) => {
    const chats = store.chats.list({ projectId: project.id, includeArchived: true });
    const ids = [...new Set(chats.flatMap((chat) => [chat.id, ...descendantsOf(store.chats, chat.id).map((c) => c.id)]))];
    store.chats.trash(ids, trashId, at);
    for (const id of ids) runner.forget(id);
  });
}
