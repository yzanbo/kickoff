// チャットに送る指示の下ごしらえ（Runner から使う）: チャットの作成・名前の付け方・添付と届かなかった報告の書き添え
import { randomUUID } from "node:crypto";
import { undeliveredReports, withUndeliveredReports } from "./reportHandover.js";
import { resolveChatOptions } from "@shared/chat/chatOptions";
import type { ExecutionDeps } from "./turn.js";
import type { Attachment, ChatOptions } from "@shared/types";
import { withAttachmentNote } from "./uploads.js";

export interface StartChatInput {
  projectId: number;
  prompt: string;
  title?: string;
  options?: ChatOptions;
  attachments?: Attachment[];
  /** 自分で作ったグループ（グループの＋から始めたとき） */
  groupId?: number;
  /** 作業場所（ワークツリーのフォルダ。省略なら本体） */
  worktreePath?: string;
}

/**
 * 新しいチャットを作り、最初の発言を記録する（実行の待機列に入れるのは Runner）。prompt は添付のパスを書き添えた、AI に渡す文。
 * messageUuid は発言の ID（Claude Code にも同じ ID で渡し、ファイルをこの発言の時点に戻すときの目印にする）
 */
export async function createChat(deps: ExecutionDeps, input: StartChatInput) {
  const { store, providers } = deps;
  const project = store.getProject(input.projectId);
  if (!project) throw new Error("プロジェクトが見つかりません");
  if (!providers[project.provider].implemented) throw new Error(`${providers[project.provider].label} はまだ使えません`);

  // チャット欄で指定がなければ、プロジェクトの既定 → アプリ全体の設定の順に使う
  const defaults = resolveChatOptions(store.getSettings(), project.defaults);
  const options = input.options ?? {};
  const model = options.model ?? (project.provider === "claude" ? defaults.model || null : null);
  const chat = store.createChat({
    project_id: project.id,
    provider: project.provider,
    title: input.title ?? firstLine(input.prompt),
    status: "queued",
    model,
    effort: options.effort === undefined ? defaults.effort : options.effort,
    permission_mode: options.permission_mode ?? defaults.permission,
    fast_mode: options.fast_mode ?? defaults.fastMode,
    group_id: input.groupId ?? null,
    worktree_path: input.worktreePath ?? "",
  });
  const attachments = input.attachments ?? [];
  const messageUuid = randomUUID();
  store.addEvent(chat.id, { type: "user", text: input.prompt, ...(attachments.length ? { attachments } : {}), message_uuid: messageUuid });
  if (!input.title) void autoTitle(deps, chat.id, input.prompt || attachments.map((a) => a.name).join("、"));
  return { chat, prompt: await promptWithAttachments(deps, input.prompt, attachments), messageUuid };
}

/**
 * 続きの指示の下ごしらえ: 添付のパスと、親に届かなかったサブエージェントの報告を添える（前の作業が報告を受け取る前に
 * 終わっていたとき。送るまで残っている報告を、次の自然な機会に渡す）。handover は自分の発言の記録に足す
 */
export async function followupPrompt(deps: ExecutionDeps, chatId: number, text: string, attachments: Attachment[]) {
  const lost = undeliveredReports(deps.store.listEvents(chatId));
  const prompt = withUndeliveredReports(await promptWithAttachments(deps, text, attachments), lost);
  return { prompt, handover: lost.length ? { handover: lost.map((s) => s.key) } : {} };
}

/** 最初の発言の 1 行目（60 文字まで）。AI が名前を付けるまでのチャット名 */
function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/** チャット名を AI に付けてもらう（ユーザーが名前を変えていなければ置き換える） */
async function autoTitle({ store, providers }: ExecutionDeps, chatId: number, text: string) {
  const chat = store.getChat(chatId);
  const provider = chat ? providers[chat.provider] : undefined;
  if (!chat || !provider?.title || !text.trim()) return;
  try {
    const title = await provider.title(text);
    const latest = store.getChat(chatId);
    if (title && latest && latest.title === chat.title) store.updateChat(chatId, { title });
  } catch {
    // 付けられなくても困らない（最初の発言のまま）
  }
}

/** 添付ファイルのパスをメッセージに書き添える（エージェントは Read ツールで読む） */
async function promptWithAttachments({ uploads }: ExecutionDeps, text: string, attachments: Attachment[]): Promise<string> {
  if (attachments.length === 0 || !uploads) return text;
  const files = [];
  for (const attachment of attachments) {
    const resolved = await uploads.resolve(attachment.id);
    if (resolved) files.push({ path: resolved.path, attachment });
  }
  return withAttachmentNote(text, files);
}
