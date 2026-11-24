// チャットに送る指示の下ごしらえ（Runner から使う）: チャットの作成・名前の付け方・添付（送る文の組み立て prompt/compose.ts）と届かなかった報告の書き添え
import { randomUUID } from "node:crypto";
import { resolveChatOptions } from "@shared/ai/chatOptions";
import { knownModel, askTitle, canAsk } from "@/features/ai/core/index";
import type { RunnerDeps } from "@/features/chat/core/run/runner";
import type { Attachment, ChatOptionsPatch, GitHubLink } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { appendSections, composePrompt } from "./prompt/compose";
import type { MessageNote, TurnContributor } from "./run/turn/contributor";

export interface StartChatInput {
  projectId: number;
  prompt: string;
  title?: string;
  options?: ChatOptionsPatch;
  attachments?: Attachment[];
  /** 自分で作ったグループ（グループの＋から始めたとき） */
  groupId?: number;
  /** 作業場所（ワークツリーのフォルダ。省略なら本体） */
  worktreePath?: string;
  /** 子チャット: 親と、親の会話のどの記録から聞いたか */
  parentChatId?: number;
  parentEventId?: number;
  /** 続きから始める会話（子チャットで親の会話を引き継ぐとき。親の会話を写したセッション） */
  sessionId?: string;
  /**
   * 続きから始める会話を、作ったあとで用意する（子チャットで親の会話を写すとき。親の記録が大きいと数十秒かかるので、
   * チャットと最初の発言を先に作って返し、写し終えてから動かす。Runner.start）
   */
  prepareSession?: () => Promise<string>;
  /** 最初の発言の前に残すお知らせ（子チャットで、親の会話を引き継いだか） */
  notice?: string;
  /** 名前（1 行目・AI が付ける名前）のもとにする文（なければ prompt。子チャットでは引用を除いた質問だけ） */
  titleText?: string;
  /** ノートのチャット: どのノートについてのチャットか（ノートのフォルダからの相対パス） */
  notePath?: string;
  /** Git で管理していないファイルだけを書けるチャット（ワークツリーの実行環境の［AI で整える］） */
  untrackedOnly?: boolean;
  /** 結び付ける GitHub の issue・PR */
  github?: GitHubLink;
  /** AI が作った世代（AI の create_chat が作るときだけ。省けば 0 = 利用者が作った） */
  aiGeneration?: number;
  /** 動かす AI（省けばプロジェクトの AI。チャットを作ったあとは変えない） */
  provider?: ProviderId;
}

/**
 * 新しいチャットを作り、最初の発言を記録する（動かすのは Runner）。prompt は添付のパスを書き添えた、AI に渡す文。
 * messageUuid は発言の ID（Claude Code にも同じ ID で渡し、ファイルをこの発言の時点に戻すときの目印にする）。
 * created はチャットを作った直後に呼ぶ（このあとの下ごしらえの間も作業中に数えるため）
 */
export async function createChat(deps: RunnerDeps, input: StartChatInput, created?: (chatId: number) => void) {
  const { store, providers } = deps;
  const project = store.projects.get(input.projectId);
  if (!project) throw new NotFound("プロジェクトが見つかりません");
  // 動かす AI は、指定がなければプロジェクトの AI（チャットごとに選べる。途中では変えない）
  const providerId = input.provider ?? project.provider;
  if (!providers[providerId].implemented) throw new Invalid(`${providers[providerId].label} はまだ使えません`);

  // チャット欄で指定がなければ、その AI のプロジェクトの既定 → アプリ全体の設定の順に使う。
  // その AI のモデルの一覧にない名前は外す（その AI の既定で動かす）
  const resolved = resolveChatOptions(store.settings.get(), providerId, store.aiDefaults.of(project.id), input.options);
  const options = { ...resolved, model: await knownModel(providerId, providers[providerId], resolved.model) };
  const titleText = input.titleText ?? input.prompt;
  const made = store.chats.create({
    project_id: project.id,
    provider: providerId,
    title: input.title ?? firstLine(titleText),
    status: "running",
    ...options,
    group_id: input.groupId ?? null,
    worktree_path: input.worktreePath || null,
    parent_chat_id: input.parentChatId ?? null,
    parent_event_id: input.parentEventId ?? null,
    note_path: input.notePath ?? null,
    untracked_only: input.untrackedOnly ?? false,
    github_repo: input.github?.repo ?? null,
    github_number: input.github?.number ?? null,
    github_kind: input.github?.kind ?? null,
    ai_generation: input.aiGeneration ?? 0,
  });
  created?.(made.id);
  // 親の会話を引き継ぐ子チャットは、親の会話を写したセッションの続きから始める
  const chat = input.sessionId ? store.chats.update(made.id, { session_id: input.sessionId }) : made;
  if (input.notice) store.events.add(chat.id, { type: "notice", message: input.notice });
  const attachments = input.attachments ?? [];
  const messageUuid = randomUUID();
  store.events.add(chat.id, { type: "user", text: input.prompt, ...(attachments.length ? { attachments } : {}), message_uuid: messageUuid });
  if (!input.title) void autoTitle(deps, chat.id, titleText || attachments.map((a) => a.name).join("、"));
  return { chat, prompt: await promptWithAttachments(deps, project, input.prompt, attachments), messageUuid };
}

/**
 * 続きの指示の下ごしらえ: 添付のパスと、登録した contributor の添える文（親に届かなかったサブエージェントの報告など。前の作業が報告を受け取る前に
 * 終わっていたとき。送るまで残っている報告を、次の自然な機会に渡す）を添える。handover は自分の発言の記録に足す
 */
export async function followupPrompt(deps: RunnerDeps, chatId: number, text: string, attachments: Attachment[]) {
  const chat = deps.store.chats.get(chatId);
  const project = (chat && deps.store.projects.get(chat.project_id)) ?? null;
  const notes = await messageNotes(deps.contributors ?? [], chatId, text);
  const prompt = appendSections(await promptWithAttachments(deps, project, text, attachments), ...notes.map((n) => n.text)) ?? "";
  const handover = notes.flatMap((n) => n.handover ?? []);
  return { prompt, handover: handover.length ? { handover } : {} };
}

/** 送る・伝える指示の後ろに添える文（登録した contributor の messageNote を order の順に。ないものは除く） */
async function messageNotes(contributors: readonly TurnContributor[], chatId: number, text: string): Promise<MessageNote[]> {
  const notes: MessageNote[] = [];
  for (const c of [...contributors].sort((a, b) => a.order - b.order)) {
    const note = await c.messageNote?.(chatId, text);
    if (note) notes.push(note);
  }
  return notes;
}

/**
 * まだ名前も発言もないチャット（聞かずに開いた子チャット）に初めて送るとき、作るときと同じく、その文の 1 行目を名前にして AI にも名前を付けてもらう。
 * 名前を変えた・もう発言のあるチャットはそのまま
 */
export function nameOnFirstMessage(deps: RunnerDeps, chatId: number, text: string, attachments: Attachment[]) {
  const chat = deps.store.chats.get(chatId);
  if (!chat || chat.title !== "" || deps.store.events.exists(chatId, { type: "user" })) return;
  const titleText = text.trim() || attachments.map((a) => a.name).join("、");
  deps.store.chats.update(chatId, { title: firstLine(titleText) });
  void autoTitle(deps, chatId, titleText);
}

/** 最初の発言の 1 行目（60 文字まで）。AI が名前を付けるまでのチャット名 */
function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/** チャット名を AI に付けてもらう（ユーザーが名前を変えていなければ置き換える） */
async function autoTitle({ store, providers }: RunnerDeps, chatId: number, text: string) {
  const chat = store.chats.get(chatId);
  const provider = chat ? providers[chat.provider] : undefined;
  if (!chat || !canAsk(provider) || !text.trim()) return;
  try {
    const title = await askTitle(provider, text);
    const latest = store.chats.get(chatId);
    if (title && latest && latest.title === chat.title) store.chats.update(chatId, { title });
  } catch {
    // 付けられなくても困らない（最初の発言のまま）
  }
}

/** 添付のパスを書き添えた、AI に渡す文（添付の口が書く。ノートの写しの元のノートは、プロジェクトのノートのフォルダから引く） */
function promptWithAttachments({ attachments: port }: RunnerDeps, project: Project | null, text: string, attachments: Attachment[]): Promise<string> {
  return composePrompt(port, project, text, attachments);
}
