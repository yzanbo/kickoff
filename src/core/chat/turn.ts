import type { BrowserControl } from "../browser/control.js";
import type { TerminalControl } from "../terminal/control.js";
import { createDbAiTools, hasAiConnections } from "../databases/aiTools.js";
import { hiddenDbTargets } from "./guard/hiddenDbTargets.js";
import { createDockerGuard } from "../docker/guardFacts.js";
import type { DockerService } from "../docker/service.js";
import type { WorktreeEnvService } from "../worktreeEnv/service.js";
import type { DatabaseService } from "../databases/service.js";
import type { WorktreeFinisher } from "../worktrees/finish.js";
import { githubEnvForGit, runAsGitHubAccount } from "../git/githubAccount.js";
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalCenter } from "./approvals.js";
import { chosenPreviews } from "@shared/chat/questionPreviews";
import { isUnreadEvent } from "@shared/chat/state";
import type { Bus } from "../bus.js";
import { errorMessage } from "@shared/errors";
import { currentBranch } from "../git/index.js";
import { isInside } from "../system/paths.js";
import { buildSystemPrompt, CHAT_POLICY } from "./policy.js";
import { chatContextNote, chatContextOf } from "./chatContext.js";
import { createAiChatEditTools } from "./aiChatEdit.js";
import { createAiOpenTools } from "./aiOpen.js";
import { createAiChatReadTools } from "./aiChatRead.js";
import { createAiProjectTools } from "./aiProject.js";
import { createAiTerminalTools } from "./aiTerminal.js";
import { createAiVisualTools } from "./aiVisual.js";
import { createAiWorktreeTools } from "./aiWorktree.js";
import type { MemoService } from "../memos/memos.js";
import type { UsageMonitor } from "../usage/planUsage.js";
import { canCreateChat, createAiCreateChatTools, type StartedChild } from "./aiCreateChat.js";
import type { ChildChatInput } from "./children.js";
import type { AgentProvider, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "../providers/types.js";
import { trashCommandEnv, type TrashCommand } from "../trash/command.js";
import { switchAfterCompact, type SessionTrash } from "./sessionSwitch.js";
import type { Store } from "../db/store.js";
import { networkStoppedSubagents, unfinishedSubagents } from "@shared/chat/subagents";
import type { Project, ProviderId, Chat, CompactTrigger, Question } from "@shared/types";
import type { UploadStore } from "./uploads.js";
import type { ChatRuntime } from "./runtime.js";
import { workdirOf } from "./workdir.js";
import { autoPreCompactParams, postCompactItem, postCompactPromptOf, preCompactPromptOf } from "./preCompact.js";

/** 実行に使うもの（Runner から受け取る） */
export interface ExecutionDeps {
  store: Store;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  uploads?: UploadStore;
  bus?: Bus;
  /** プロジェクトのメモのフォルダ（メモのチャットで、AI にメモを読み書きさせるため。なければメモのチャットでもメモのフォルダを足さない） */
  memoDirOf?: (project: Project) => string;
  /** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。なければ AI にブラウザのツールを出さない） */
  browser?: BrowserControl;
  /** 内蔵ターミナルの読み取り（デスクトップアプリのメインプロセスが渡す。なければ AI にターミナルのツールを出さない） */
  terminals?: TerminalControl;
  /** DB クライアント（AI に見せる接続があるプロジェクトで、AI に DB のツールを出す。なければ出さない） */
  databases?: DatabaseService;
  /** チャットを作る（Runner が渡す。チャットの AI にチャット（子・兄弟・親のないチャット）を作るツールを出す。なければ出さない） */
  startChat?: (from: Chat, input: ChildChatInput) => Promise<StartedChild>;
  /** Docker タブ（AI の Docker の守りが docker ps・compose の組の名前を引く。なければ守りを付けない） */
  docker?: DockerService;
  /** ワークツリーの実行環境（作業場所がポートの帯を持つワークツリーなら、AI に PORT を渡す。なければ渡さない） */
  worktreeEnvs?: WorktreeEnvService;
  /** Claude のプランの使用枠（AI の get_usage が読む。なければ使えないと返す） */
  usage?: UsageMonitor;
  /** メモ（AI の move_memo が名前を変える・移す。なければそのツールは使えないと返す） */
  memos?: MemoService;
  /** チャットが作業中か（AI の update_chat が、作業中の子チャットを親から外すのを断る。Runner が渡す。なければ作業中とみなさない） */
  isBusy?: (chatId: number) => boolean;
  /**
   * AI に渡す kickoff-trash（rm の代わりに Kickoff のゴミ箱へ入れる。trash/command.ts）。あれば PATH などを渡し、rm・git clean などを断る守りを付ける。
   * なければ（置けなかった・テスト）付けない
   */
  trashCommand?: TrashCommand;
  /** 乗り換えた古い会話記録をゴミ箱へ入れる（メモの仕様書「ファイル削除」の Q18。なければ乗り換えても古い記録は残す） */
  sessionTrash?: SessionTrash;
  /** ワークツリーの後始末（AI の finish_worktree。Runner を作ったあとで useWorktreeFinisher が渡す。なければそのツールを出さない） */
  worktreeFinisher?: WorktreeFinisher;
}

/** 1 回の実行の依頼（送った指示。すぐ動かす） */
export interface TurnRequest {
  chatId: number;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルを戻すときの目印） */
  promptId?: string;
  /** 会話の要約（/compact）。発言・結果としては残さず、未読にもしない */
  compact?: boolean;
  /** 手で圧縮する前の圧縮前指示。最後まで終わったら、続けて会話を圧縮する（Runner） */
  thenCompact?: boolean;
  /**
   * 圧縮のきっかけ（compact のとき。省けば手で圧縮した manual）。自動の圧縮の前の圧縮前指示の作業が、圧縮しないまま終わったときに
   * Runner が続けて圧縮する実行は auto（上限に近づいて Claude Code が始めようとした圧縮を、作業の終わりで済ませる）
   */
  compactTrigger?: CompactTrigger;
}

/** 1 回の実行の終わり方（Runner が次に何をするかを決める） */
export interface TurnOutcome {
  status: "completed" | "failed" | "cancelled";
  /** 通信の切断で失敗した（つながったら自動で再開する） */
  network: boolean;
  /** 通信の切断で止まったサブエージェント（再開するときに、続きから再開するよう頼む） */
  stoppedAgents?: StoppedAgent[];
  /** 使用枠の上限で止まった（枠が戻ったら、続けるかを聞く。resetsAt: 戻る時刻。分からなければ null） */
  usageLimit?: { resetsAt: string | null };
}

/** 通信の切断で止まったサブエージェント（SendMessage の宛先と名前） */
export interface StoppedAgent {
  agentId: string;
  description: string;
}

/**
 * 1 回の実行を最後まで進める: 作業場所を決めてプロバイダーを動かし、結果をチャットに反映する。
 * 作業中の様子（裏の作業・再試行・圧縮中・作業中のチャットへの操作）はチャットの runtime に書く（画面には runtime が配る）。
 * 失敗はチャットの失敗として記録する（投げない）。中断は signal で伝わる
 */
export async function executeTurn(deps: ExecutionDeps, runtime: ChatRuntime, { chatId, prompt, promptId, compact = false, compactTrigger }: TurnRequest, signal: AbortSignal): Promise<TurnOutcome> {
  const { store, providers } = deps;
  try {
    const chat = store.chats.get(chatId)!;
    const project = store.projects.get(chat.project_id)!;
    const cwd = await resolveWorkdir(chat, project);
    // 作業しているブランチを覚えておく（ワークツリーを片付けたあとも、どのブランチの作業だったか分かるように。外れていれば前のまま）
    const branch = await currentBranch(cwd);
    store.chats.update(chatId, { status: "running", turn_started_at: new Date().toISOString(), ...(branch ? { branch } : {}) });
    // この実行より前の記録（止まったサブエージェントを、この実行の分だけ数えるため）
    const since = store.events.list(chatId).at(-1)?.id ?? 0;
    // 上限に近づいて自動で圧縮する前に足す圧縮前指示（手で圧縮する実行には足さない）
    const preCompactText = compact ? null : preCompactPromptOf(store, project);
    // 圧縮したら（手で・自動のどちらも）、預かった指示より先に送る圧縮後指示
    const postCompactText = postCompactPromptOf(store, project);
    // プロジェクトで GitHub のアカウントを選んでいれば、AI が動かす gh・git もそのアカウントにする（gh にそのアカウントがなければ、gh で有効なもののまま）
    // 作業場所がポートの帯を持つワークツリーなら、開発サーバーの番号（PORT=帯+00）も渡す
    // rm の代わりに Kickoff のゴミ箱へ入れる kickoff-trash を PATH に足す（どこで消しても、どのチャットが消したか分かるようにチャットの ID も）
    const env = {
      ...(deps.worktreeEnvs?.envFor(cwd) ?? {}),
      ...(project.github_account ? await runAsGitHubAccount(project.github_account, githubEnvForGit) : {}),
      ...(deps.trashCommand ? trashCommandEnv(deps.trashCommand, chat.id) : {}),
    };

    // 動かし始める前（作業場所・ブランチを調べている間）に止められたら、プロバイダーを動かさずに中断で終える
    // （中断済みの signal には abort の知らせがもう来ないので、渡すと最後まで動いてしまう）
    const result: ProviderTurnResult = signal.aborted
      ? { status: "cancelled", sessionId: chat.session_id }
      : await providers[chat.provider].run(
          { ...buildTurnParams(deps, chat, project, cwd, prompt, promptId), preCompact: autoPreCompactParams(preCompactText, chat, runtime.preCompactSent), env },
          callbacksFor(deps, runtime, chat, signal, compact, compactTrigger ?? compactTriggerOf(prompt, compact), { pre: preCompactText, post: postCompactText }),
          signal,
        );
    const network = result.status === "failed" && Boolean(result.network);
    applyResult(store, chatId, result, compact, since, network);
    // 圧縮した作業が最後まで終わったら、直近の区切りだけの新しいセッションに乗り換える（会話記録が大きくなり続けないように。失敗しても作業は止めない）
    if (result.status === "completed") {
      await switchAfterCompact({ store, provider: providers[chat.provider], trash: deps.sessionTrash }, chatId, cwd, since).catch((e: unknown) =>
        console.warn(`[session] 会話記録を乗り換えられませんでした: ${errorMessage(e)}`),
      );
    }
    const usageLimit = result.status === "failed" && !network ? result.usageLimit : undefined;
    if (!network) return { status: result.status, network, ...(usageLimit ? { usageLimit } : {}) };
    const stoppedAgents = networkStoppedSubagents(store.events.list(chatId), since).map((s) => ({ agentId: s.agentId!, description: s.description }));
    return { status: result.status, network, stoppedAgents };
  } catch (e) {
    const message = errorMessage(e);
    // 失敗も、見るまでは未読にする
    store.chats.update(chatId, { status: "failed", error: message, unread: true });
    store.events.add(chatId, { type: "error", message });
    return { status: "failed", network: false };
  } finally {
    // 再試行・裏の作業・圧縮中の表示を消す（終わったので。Claude Code が終わると裏の作業も残らない）
    runtime.control = null;
    runtime.update({ retry: null, background: null, compacting: null, drawingVisual: false });
  }
}

/**
 * この実行の中の圧縮のきっかけ: 手で圧縮した（圧縮のボタン = compact、チャット欄から /compact を送った）なら manual、
 * ほかの指示の途中で起きた圧縮は、コンテキストが上限に近づいて Claude Code が自動で始めたもの
 */
function compactTriggerOf(prompt: string, compact: boolean): CompactTrigger {
  return compact || /^\/compact(?:\s|$)/.test(prompt.trimStart()) ? "manual" : "auto";
}

/** 作業場所（workdirOf）。フォルダが消えていれば（ワークツリーをアプリの外で消したときなど）分かる文で止める */
async function resolveWorkdir(chat: Chat, project: Project): Promise<string> {
  const cwd = workdirOf(chat, project);
  const isDir = await fs.stat(cwd).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`作業場所のフォルダが見つかりません（${cwd}）。ワークツリーが消された可能性があります。新しいチャットで作業場所を選び直してください`);
  return cwd;
}

/** フォルダがなければ作って返す（作れなければ null。メモのフォルダ） */
function ensureDir(dir: string): string | null {
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

/** プロバイダーに渡すもの（作業場所・指示・権限） */
function buildTurnParams(deps: ExecutionDeps, chat: Chat, project: Project, cwd: string, prompt: string, promptId?: string): ProviderTurnParams {
  // メモのフォルダも読み書きできる場所に足し、どのチャットでも「メモ」が「メモ」タブのメモのことだと伝える（入力欄にメモを添付して続きを頼む・「メモに書いて」と頼めるように。
  // フォルダがまだなければ作る: メモのタブで最初のメモを作るのと同じ場所）。メモのチャットは、どのメモについての会話かも伝える（作業場所はプロジェクトのまま。コードも読める）
  const memoDir = deps.memoDirOf ? ensureDir(deps.memoDirOf(project)) : null;
  return {
    cwd,
    prompt,
    ...(promptId ? { promptId } : {}),
    systemPrompt: buildSystemPrompt(project, cwd, memoDir ? { dir: memoDir, file: chat.memo_path ? path.join(memoDir, chat.memo_path) : null } : undefined, { trash: deps.trashCommand !== undefined }),
    turnContext: chatContextNote(chatContextOf(deps.store, chat)),
    policy: CHAT_POLICY,
    resumeSessionId: chat.session_id,
    model: chat.model,
    effort: chat.effort,
    permissionMode: chat.permission_mode,
    fastMode: chat.fast_mode,
    autoCompactPct: deps.store.settings.get().auto_compact_pct,
    // 添付ファイルの保存先と参照資料を読めるようにし、リポジトリの外の参照資料には書き込ませない
    additionalDirectories: [...(deps.uploads ? [deps.uploads.dir] : []), ...referenceDirectories(project), ...(memoDir ? [memoDir] : [])],
    // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
    readOnlyPaths: project.reference_paths.map((r) => r.path).filter((p) => !isInside(cwd, p)),
    // ［AI で整える］のチャットは、Git で管理していないファイルだけを書ける（続きの指示でも）
    untrackedOnly: chat.untracked_only,
    browser: deps.browser ? { control: deps.browser, projectId: chat.project_id, chatId: chat.id } : null,
    database:
      deps.databases && hasAiConnections(deps.store, project.id)
        ? createDbAiTools({ store: deps.store, databases: deps.databases }, { project, workdir: chat.worktree_path, chatId: chat.id })
        : null,
    // チャット（子・兄弟・親のないチャット）を作るツール（設定で止めていない・AI が作った世代の上限に達していないときだけ。1 回の作業で数を数えるので作業ごとに作る）
    createChat:
      deps.startChat && canCreateChat(deps.store, chat)
        ? createAiCreateChatTools({ store: deps.store, startChat: deps.startChat, worktreeEnvs: deps.worktreeEnvs }, chat.id)
        : null,
    // 同じ家系のチャットの名前・固定・グループを変えるツール（どのチャットにも。孫チャット・子チャットを作らせない設定のときも渡す）
    chatEdit: createAiChatEditTools(deps.store, chat.id, deps.isBusy ?? (() => false)),
    // このプロジェクトのメモ・同じ家系のチャットを画面に開くツール（どのチャットにも。画面に頼む口（バス）があるときだけ）
    open: deps.bus ? createAiOpenTools({ store: deps.store, publish: (e) => deps.bus?.publish(e), memoDirOf: deps.memoDirOf }, chat.id) : null,
    // 同じプロジェクトのチャットの一覧・会話と使用枠を読むツール（どのチャットにも）
    chatRead: createAiChatReadTools({ store: deps.store, approvals: deps.approvals, usage: deps.usage }, chat.id),
    // このプロジェクトの定型文に足す・メモの名前を変える／移すツール（どのチャットにも）
    chatProject: createAiProjectTools({ store: deps.store, memos: deps.memos }, chat.id),
    // このプロジェクトの内蔵ターミナルの出力を読むツール（どのチャットにも。メインプロセスが口を渡したときだけ）
    chatTerminal: deps.terminals ? createAiTerminalTools({ store: deps.store, terminals: deps.terminals }, chat.id) : null,
    // 返答の中に図（SVG・HTML・Mermaid）を描くツール（どのチャットにも。画面とスマホが記録から描く）
    chatVisual: createAiVisualTools(deps.store, chat.id),
    // ワークツリーを片付けるツール（どのチャットにも。本体のチャットはどのワークツリーでも、ワークツリーのチャットは自分のものだけ。後始末を渡してあるときだけ）
    chatWorktree: deps.worktreeFinisher ? createAiWorktreeTools(deps.worktreeFinisher, chat.id) : null,
    // 「見せない」接続に、AI が Bash・ファイルのツールで直接入るのを断る（SQLite のファイルは作業場所と本体の両方で解く）
    hiddenDb: hiddenDbTargets(deps.store.dbConnections.list(project.id), [cwd, project.repo_path]),
    // 別の作業場所・ほかのプロジェクトの Docker のコンテナとボリュームに手を出す Bash は、流す前に承認カードで聞く
    dockerGuard: deps.docker ? createDockerGuard(deps.docker, project, cwd) : null,
    // rm・git clean などでファイルを消す Bash は断り、kickoff-trash を使わせる（どこのファイルでも）
    deleteGuard: deps.trashCommand !== undefined,
  };
}

/**
 * プロバイダーからの知らせ: 途中経過は配るだけ、作業中の様子は runtime に書き（runtime が画面に配る）、イベントは記録、
 * 承認依頼は回答を待つ（待つ間は回答待ち）
 */
function callbacksFor(
  { store, approvals, bus }: ExecutionDeps,
  runtime: ChatRuntime,
  chat: Chat,
  signal: AbortSignal,
  compact: boolean,
  compactTrigger: CompactTrigger,
  { pre: preCompactText, post: postCompactText }: { pre: string | null; post: string | null },
): ProviderCallbacks {
  const chatId = chat.id;
  const projectId = chat.project_id;
  return {
    // メモのチャットでツールの結果が届いたら（AI がメモを書き換えたかもしれない）、メモが変わったと知らせる（開いているメモは、書きかけでなければ読み直す）
    subagentProgress: (subagent) => {
      bus?.publish({ type: "chat_subagent", project_id: projectId, chat_id: chatId, subagent });
    },
    commandOutput: (output) => {
      bus?.publish({ type: "chat_command_output", project_id: projectId, chat_id: chatId, output });
    },
    retry: (retry) => runtime.update({ retry }),
    // 手で圧縮する実行（圧縮のボタン）には発言を足さない（足すと、その返答が圧縮の実行の中に入り、未読・作業の終わりが残らない）。
    // 圧縮中の「いま」は、送信待ちの先頭から圧縮の実行のあとに送る
    control: (control) => {
      runtime.control = compact ? null : control;
    },
    background: (background) => runtime.update({ background }),
    drawingVisual: (drawingVisual) => runtime.update({ drawingVisual }),
    // 圧縮を始めた時刻は、終わるまで変えない（続けて始まったと知らされても、最初の時刻のまま。Claude Code は待っている間も 30 秒ごとに知らせ直す）
    // 圧縮が始まったら、この作業が終わるまで「いま」を預かる（圧縮後指示のやり取りに混ぜない。作業の終わりで Runner が外す）
    compacting: (active) =>
      runtime.update({
        compacting: active ? (runtime.compacting ?? { since: new Date().toISOString(), trigger: compactTrigger }) : null,
        ...(active ? { compactedTurn: true } : {}),
      }),
    // 失敗は、手で圧縮したときだけお知らせに残す（自動の圧縮の失敗は、会話が短くて要約するものがない too_few_groups なども含み、
    // Claude Code も知らせない。本当にあふれたら、作業そのものが失敗として残る）
    // 圧縮の直後のコンテキストの大きさは、作業の終わりを待たずにチャットへ書く（入力欄のメーターがすぐ縮む。作業の終わりには最後の応答の大きさで書き直す）
    context: (tokens) => {
      if (store.chats.get(chatId)?.context_tokens !== tokens) store.chats.update(chatId, { context_tokens: tokens });
    },
    compactFailed: (reason) => {
      if (compactTrigger === "manual") store.events.add(chatId, { type: "notice", message: `会話の圧縮に失敗しました${reason ? `（${reason}）` : ""}` });
    },
    stream: (text) => {
      bus?.publish({ type: "chat_delta", project_id: projectId, chat_id: chatId, text });
    },
    // 自動の圧縮の前に圧縮前指示を足した: 札付きの自分の発言として残す（AI には前置きを付けて送っている）
    preCompactSent: (uuid) => {
      if (!preCompactText) return;
      runtime.preCompactSent = true;
      // 圧縮が終わるまで、「いま」は預かる（圧縮前指示の作業に混ぜない）
      runtime.update({ awaitingCompact: true });
      store.events.add(chatId, { type: "user", text: preCompactText, pre_compact: true, message_uuid: uuid });
    },
    // 合図のあと裏の作業を待って止まっていたので、Kickoff が発言を足して圧縮を走らせた: 何が起きたかをお知らせに残す（足した文は AI 向けなので発言にしない）
    preCompactNudged: () => {
      store.events.add(chatId, { type: "notice", message: "圧縮前指示が済んだあと、AI が裏の作業の終わりを待って止まっていたので、会話の圧縮を始めるよう Kickoff が促しました" });
    },
    emit: (event) => {
      if (event.type === "init" && event.session_id !== store.chats.get(chatId)?.session_id) {
        store.chats.update(chatId, { session_id: event.session_id });
      }
      // 手で圧縮する実行の圧縮は、頼んだきっかけで残す（自動の圧縮の前の指示のあとに Runner が続けた圧縮は auto）
      const saved = store.events.add(chatId, event.type === "compact" && compact ? { ...event, trigger: compactTrigger } : event);
      // 圧縮した（記録を残してから）: 次に上限に近づいたら、また圧縮前指示を送る。圧縮後指示があれば、預かった指示の先頭に置く
      // （圧縮が終わったら、それらより先に伝える。圧縮前指示のあとに送った指示は、必ず圧縮後指示のあとになる）。
      // 手で圧縮する実行（compact）の終わりまでは預かったままにする（Runner が実行の終わりで外し、圧縮後指示から送る）
      if (event.type === "compact") {
        runtime.preCompactSent = false;
        const post = postCompactText ? [postCompactItem(postCompactText)] : [];
        runtime.update({ afterCompact: [...post, ...runtime.afterCompact], compactedTurn: true, ...(compact ? {} : { awaitingCompact: false }) });
        // 圧縮中をもう外していた（知らせの順が前後した）ときは、ここで伝える
        runtime.flushAfterCompact();
      }
      if (chat.memo_path && event.type === "tool_result") bus?.publish({ type: "memos", project_id: projectId, path: null });
      // 作業中でも、AI の文章の返答が届いたら未読にする（一番下まで見ると既読。要約の途中経過では付けない）
      if (!compact && isUnreadEvent(saved) && !store.chats.get(chatId)?.unread) store.chats.setUnread(chatId, true);
    },
    requestApproval: async (req, approvalSignal) => {
      const { approval, decision } = approvals.request({ chatId, projectId }, req, approvalSignal);
      store.events.add(chatId, {
        type: "approval",
        approval_id: approval.id,
        kind: approval.kind,
        tool_name: approval.tool_name,
        title: approval.title,
      });
      const answer = await decision;
      // AI からの質問に答えたときは、何と答えたか（選んだままの回答と添付・選んだ選択肢の図）も残す（画面は「質問への回答」の吹き出しで出す）
      const previews = answer.action === "answer" ? chosenPreviews((approval.input.questions as Question[] | undefined) ?? [], answer.plain ?? answer.answers) : undefined;
      store.events.add(
        chatId,
        answer.action === "answer"
          ? {
              type: "approval_resolved",
              approval_id: approval.id,
              kind: approval.kind,
              action: "answer",
              answers: answer.plain ?? answer.answers,
              ...(answer.attachments ? { attachments: answer.attachments } : {}),
              ...(previews ? { previews } : {}),
            }
          : { type: "approval_resolved", approval_id: approval.id, kind: approval.kind, action: answer.action },
      );
      return answer;
    },
  };
}

/** 結果をチャットに反映する（状態・費用・回数・コンテキスト・未読） */
function applyResult(store: Store, chatId: number, result: ProviderTurnResult, compact: boolean, since: number, network: boolean) {
  const current = store.chats.get(chatId)!;
  store.chats.update(chatId, {
    status: result.status,
    session_id: result.sessionId ?? current.session_id,
    cost_usd: current.cost_usd + (result.costUsd ?? 0),
    // 要約は会話の回数・最後の回答に数えない
    num_turns: current.num_turns + (compact ? 0 : (result.turns ?? 0)),
    error: result.error ?? null,
    ...(result.context
      ? { context_tokens: result.context.tokens, context_window: result.context.window ?? current.context_window }
      : compact && result.status === "completed"
        ? // 要約したあとの大きさが分からないときは、次の応答まで空にしておく
          { context_tokens: null }
        : {}),
    // 終わったら「未読」にする（中断・要約のときは除く）。最後の結果を一番下まで見ると消える
    unread: compact || result.status === "cancelled" ? current.unread : true,
  });
  // この実行で始めたサブエージェントが終わっていなければ、作業の終わりとともに止まったことを知らせる
  // （Claude Code のプロセスが終わるため。見た目は進んでいるようで、実は止まっているのを防ぐ）。
  // 通信の切断のときは、つながってから再開する段取り（reconnect）が知らせる
  const stopped = compact || network ? [] : unfinishedSubagents(store.events.list(chatId), since).map((s) => s.description);
  if (stopped.length > 0) {
    store.events.add(chatId, {
      type: "notice",
      message: `サブエージェント ${stopped.length} 件（${stopped.join("、")}）は、作業の終わりとともに止まりました。続けるときは、サブエージェントの一覧の「再開」を押してください。`,
    });
  }
  // 要約は compact イベントだけを残す（失敗したときは理由を残す）
  if (!compact || result.status !== "completed") {
    store.events.add(chatId, {
      type: "result",
      status: result.status,
      text: result.status === "completed" ? result.result : result.error,
      ...(network ? { network: true } : {}),
      ...(result.usageLimit ? { usage_limit: { resets_at: result.usageLimit.resetsAt ?? null } } : {}),
      // 分岐・巻き戻しの起点（最後まで終わったときだけ。止めた作業の最後のメッセージはセッションに残らないことがある）
      ...(result.status === "completed" && result.lastMessageId && result.sessionId
        ? { session_id: result.sessionId, message_id: result.lastMessageId }
        : {}),
    });
  }
}

/** 参照資料を読めるようにするフォルダ（ファイルはそのフォルダ）。重複は除く */
function referenceDirectories(project: Project): string[] {
  return [...new Set(project.reference_paths.map((r) => (r.kind === "folder" ? r.path : path.dirname(r.path))))];
}
