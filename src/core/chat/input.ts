// チャットに送る指示の下ごしらえ（Runner から使う）: チャットの作成・名前の付け方・添付と届かなかった報告の書き添え
import { randomUUID } from "node:crypto";
import { undeliveredReports, withUndeliveredReports } from "./reportHandover.js";
import { resolveChatOptions } from "@shared/chat/chatOptions";
import type { ExecutionDeps } from "./turn.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { Attachment, ChatOptionsPatch, Project } from "@shared/types";
import { withAttachmentNote } from "./uploads.js";
import { Invalid, NotFound } from "../http/errors.js";
import { isInside } from "../system/paths.js";

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
  /** 最初の発言の前に残すお知らせ（子チャットで、親の会話を引き継いだか） */
  notice?: string;
  /** 名前（1 行目・AI が付ける名前）のもとにする文（なければ prompt。子チャットでは引用を除いた質問だけ） */
  titleText?: string;
  /** メモのチャット: どのメモについてのチャットか（メモのフォルダからの相対パス） */
  memoPath?: string;
}

/**
 * 新しいチャットを作り、最初の発言を記録する（動かすのは Runner）。prompt は添付のパスを書き添えた、AI に渡す文。
 * messageUuid は発言の ID（Claude Code にも同じ ID で渡し、ファイルをこの発言の時点に戻すときの目印にする）
 */
export async function createChat(deps: ExecutionDeps, input: StartChatInput) {
  const { store, providers } = deps;
  const project = store.projects.get(input.projectId);
  if (!project) throw new NotFound("プロジェクトが見つかりません");
  if (!providers[project.provider].implemented) throw new Invalid(`${providers[project.provider].label} はまだ使えません`);

  // チャット欄で指定がなければ、プロジェクトの既定 → アプリ全体の設定の順に使う
  const options = resolveChatOptions(store.settings.get(), project.chat_defaults, input.options);
  const titleText = input.titleText ?? input.prompt;
  const created = store.chats.create({
    project_id: project.id,
    provider: project.provider,
    title: input.title ?? firstLine(titleText),
    status: "running",
    ...options,
    group_id: input.groupId ?? null,
    worktree_path: input.worktreePath || null,
    parent_chat_id: input.parentChatId ?? null,
    parent_event_id: input.parentEventId ?? null,
    memo_path: input.memoPath ?? null,
  });
  // 親の会話を引き継ぐ子チャットは、親の会話を写したセッションの続きから始める
  const chat = input.sessionId ? store.chats.update(created.id, { session_id: input.sessionId }) : created;
  if (input.notice) store.events.add(chat.id, { type: "notice", message: input.notice });
  const attachments = input.attachments ?? [];
  const messageUuid = randomUUID();
  store.events.add(chat.id, { type: "user", text: input.prompt, ...(attachments.length ? { attachments } : {}), message_uuid: messageUuid });
  if (!input.title) void autoTitle(deps, chat.id, titleText || attachments.map((a) => a.name).join("、"));
  return { chat, prompt: await promptWithAttachments(deps, project, input.prompt, attachments), messageUuid };
}

/**
 * 続きの指示の下ごしらえ: 添付のパスと、親に届かなかったサブエージェントの報告を添える（前の作業が報告を受け取る前に
 * 終わっていたとき。送るまで残っている報告を、次の自然な機会に渡す）。handover は自分の発言の記録に足す
 */
export async function followupPrompt(deps: ExecutionDeps, chatId: number, text: string, attachments: Attachment[]) {
  const lost = undeliveredReports(deps.store.events.list(chatId));
  const chat = deps.store.chats.get(chatId);
  const project = (chat && deps.store.projects.get(chat.project_id)) ?? null;
  const prompt = withUndeliveredReports(await promptWithAttachments(deps, project, text, attachments), lost);
  return { prompt, handover: lost.length ? { handover: lost.map((s) => s.key) } : {} };
}

/**
 * まだ名前も発言もないチャット（聞かずに開いた子チャット）に初めて送るとき、作るときと同じく、その文の 1 行目を名前にして AI にも名前を付けてもらう。
 * 名前を変えた・もう発言のあるチャットはそのまま
 */
export function nameOnFirstMessage(deps: ExecutionDeps, chatId: number, text: string, attachments: Attachment[]) {
  const chat = deps.store.chats.get(chatId);
  if (!chat || chat.title !== "" || deps.store.events.list(chatId).some((e) => e.type === "user")) return;
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
async function autoTitle({ store, providers }: ExecutionDeps, chatId: number, text: string) {
  const chat = store.chats.get(chatId);
  const provider = chat ? providers[chat.provider] : undefined;
  if (!chat || !provider?.title || !text.trim()) return;
  try {
    const title = await provider.title(text);
    const latest = store.chats.get(chatId);
    if (title && latest && latest.title === chat.title) store.chats.update(chatId, { title });
  } catch {
    // 付けられなくても困らない（最初の発言のまま）
  }
}

/** 添付したメモの見出し（メモはメモのフォルダのファイルそのもの。頼まれたら AI が続きを書けるように） */
const MEMO_ATTACHMENT_HEADING = "添付したメモ（メモのフォルダのファイルそのものです。Read ツールで読めます。頼まれたら、このファイルを直接書き換えてかまいません）";

/**
 * 添付ファイルのパスをメッセージに書き添える（エージェントは Read ツールで読む）。メモの添付は、チャットのプロジェクトのメモのフォルダの
 * ファイルのパスを書く（見つからない添付・メモは書かない）
 */
async function promptWithAttachments({ uploads, memoDirOf }: ExecutionDeps, project: Project | null, text: string, attachments: Attachment[]): Promise<string> {
  const files = [];
  const memos = [];
  for (const attachment of attachments) {
    if (attachment.memo !== undefined) {
      const file = project && memoDirOf ? await memoFile(memoDirOf(project), attachment.memo) : null;
      if (file) memos.push(file);
      continue;
    }
    const resolved = await uploads?.resolve(attachment.id);
    if (resolved) files.push({ path: resolved.path, attachment });
  }
  const withFiles = withAttachmentNote(text, files);
  if (memos.length === 0) return withFiles;
  const note = `${MEMO_ATTACHMENT_HEADING}:\n${memos.map((m) => `- ${m}`).join("\n")}`;
  return withFiles.trim() ? `${withFiles}\n\n${note}` : note;
}

/** メモのフォルダの中のファイルの絶対パス（外を指す・ないなら null） */
async function memoFile(dir: string, memo: string): Promise<string | null> {
  const file = path.join(dir, memo);
  if (!isInside(dir, file) || file === dir) return null;
  return (await fs.stat(file).then((s) => s.isFile(), () => false)) ? file : null;
}
