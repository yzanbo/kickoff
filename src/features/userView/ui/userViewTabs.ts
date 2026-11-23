// パネルのタブの種類ごとの、AI の get_user_view に返す説明（contributes.ts が userViewTabs に入れる）。
// プロジェクトの画面のタブは、持ち主が viewDescribers に出した説明（DB・GitHub）のほか（ファイル・検索・履歴・CI・Docker・ゴミ箱）を画面の名前の画面として説明する。
// 種類の持ち主（chatPanel・files・notes など）は userView より上なので、説明は userView がまとめて持つ（読むのは下の chat・composer・projects だけ）
import { knownChat } from "@/features/chat/ui";
import { newChatDraft } from "@/features/composer/ui";
import { projectViewOf } from "@/features/projects/ui";
import { describeTab, editorView, noteView, projectViewTab, userViewTabs } from "./tabDescribers";

export const userViewTabItems = [
  describeTab("chat", (t) => ({ kind: "chat", chat_id: t.id, title: t.title ?? knownChat(t.id)?.title ?? "", project_id: t.projectId })),
  describeTab("new", (t) => ({ kind: "new_chat", project_id: newChatDraft(t.key)?.projectId ?? 0 })),
  describeTab("subagent", (t) => ({ kind: "subagent", title: t.title })),
  describeTab("child", (t) => ({ kind: "child_chat", chat_id: t.childId, title: t.title, project_id: t.projectId })),
  describeTab("newChild", (t) => ({ kind: "page", label: "新しい子チャット（送る前）", project_id: t.projectId })),
  describeTab("changes", (t) => ({ kind: "changes", worktree: t.worktree ?? null, focus: t.focus ?? null, project_id: t.projectId })),
  describeTab("file", (t) => editorView(t.projectId, t.path, t.worktree ?? null, t.line)),
  describeTab("projectFile", (t) => editorView(t.projectId, t.path, null, t.line)),
  describeTab("note", (t) => noteView(t.projectId, t.path)),
  describeTab("projectView", (t) => projectViewTab(t.view, { projectId: t.projectId, surface: `chat-${t.chatId}` }, projectViewOf(t.view)?.label ?? t.view)),
  describeTab("browser", (t) => ({ kind: "browser", url: t.current ?? t.url, title: t.title })),
  describeTab("terminal", (t) => ({ kind: "terminal", label: t.title ?? t.label, project_id: t.projectId })),
].map((d) => userViewTabs.item(d));
