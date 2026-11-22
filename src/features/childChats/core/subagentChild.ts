// サブエージェントについて子チャットで聞く: サブエージェントの会話の記録を添付にして、そのチャットの子チャットで聞く
// （メインエージェントにもサブエージェント本人にも伝わらず、記録を読んだ別の AI がサブエージェントの続きとして答える）
import { UNTITLED_CHAT_TITLE, type Attachment, type Chat, type ChatOptionsPatch } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { collectSubagents } from "@shared/chat/subagents";
import { subagentAskMessage } from "@shared/chat/prompts";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import { Invalid } from "@/foundation/core/errors";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { ChatRunPort } from "@/features/chat/core/index";
import type { UploadStore } from "@/features/attachments/core/uploads";
import { sessionOfSubagent, subagentLogFromEvents, subagentTranscript, subagentTranscriptFileName } from "@/features/subagents/core/subagentTranscript";
import { workdirOf } from "@/features/chat/core/workdir";

export interface SubagentChildInput {
  /** 聞くサブエージェント（Claude Code のサブエージェントの ID） */
  agentId: string;
  text: string;
  attachments?: Attachment[];
  options?: ChatOptionsPatch;
}

/**
 * サブエージェントの会話を記録から読み（Claude Code の記録。読めなければ Kickoff の記録から）、Markdown の添付にして、
 * メインのチャットの子チャットを作って聞く（始めた位置はサブエージェントを起動した呼び出し）。
 * 会話は引き継がない（親の会話を写すと、子チャットの AI が自分をメインエージェントだと思って答えるため）
 */
export async function startSubagentChildChat(
  deps: { store: Pick<ChatStoreDeps, "events" | "projects">; runner: ChatRunPort; providers: Record<ProviderId, AgentProvider>; uploads: UploadStore },
  parent: Chat,
  input: SubagentChildInput,
): Promise<Chat> {
  const { store, runner, providers, uploads } = deps;
  const events = store.events.list(parent.id);
  const entry = collectSubagents(events, {}, false).find((s) => s.agentId === input.agentId);
  if (!entry) throw new Invalid("このチャットに、そのサブエージェントが見つかりません");
  const project = store.projects.get(parent.project_id);
  const session = sessionOfSubagent(entry, events) ?? parent.session_id;
  const provider = providers[parent.provider];
  const read = session && project && provider.subagentLog ? await provider.subagentLog(session, input.agentId, workdirOf(parent, project)).catch(() => []) : [];
  const log = read.length > 0 ? read : subagentLogFromEvents(entry, events);
  const parentName = parent.title || UNTITLED_CHAT_TITLE;
  const markdown = subagentTranscript(entry, log, { chatTitle: parentName, events });
  const fileName = subagentTranscriptFileName(entry);
  const record = await uploads.save({ name: fileName, type: "text/markdown", bytes: new TextEncoder().encode(markdown) });
  return runner.start({
    projectId: parent.project_id,
    prompt: subagentAskMessage(input.agentId, entry.description, fileName, input.text),
    titleText: input.text,
    options: input.options,
    attachments: [record, ...(input.attachments ?? [])],
    worktreePath: parent.worktree_path ?? undefined,
    parentChatId: parent.id,
    parentEventId: entry.toolUseEventId,
    notice: read.length > 0 ? `親のチャット「${parentName}」のサブエージェント「${entry.description}」の会話の記録を添えて始めました` : `親のチャット「${parentName}」のサブエージェント「${entry.description}」の会話の記録が Claude Code から読めなかったので、Kickoff に残っている分（依頼・報告など）を添えて始めました`,
  });
}
