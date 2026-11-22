// パネルのタブの種類ごとの、AI の get_user_view に返す説明（userViewTabs に registry.ts が入れる）。
// 説明のない種類（プロジェクトの画面と同じ ファイル・検索・履歴・CI・Docker・ゴミ箱）は、種類の名前の画面として説明する（userView の userViewCollect.ts）。
// 持ち主の機能が出すと userView が機能の循環に入る（userView が panel・chat・database を読む）ので、userView を作り直すまでここに置く
import { knownChat } from "@/features/chat/ui";
import { newChatDraft } from "@/features/composer/ui";
import { databaseView, describeTab, editorView, githubView, noteView, userViewTabs } from "@/features/userView/ui";

export const userViewTabItems = [
  describeTab("chat", (t) => ({ kind: "chat", chat_id: t.id, title: t.title ?? t.chat?.title ?? knownChat(t.id)?.title ?? "", project_id: t.projectId })),
  describeTab("new", (t) => ({ kind: "new_chat", project_id: newChatDraft(t.key)?.projectId ?? 0 })),
  describeTab("subagent", (t) => ({ kind: "subagent", title: t.title })),
  describeTab("child", (t) => ({ kind: "child_chat", chat_id: t.childId, title: t.title, project_id: t.projectId })),
  describeTab("newChild", (t) => ({ kind: "page", label: "新しい子チャット（送る前）", project_id: t.projectId })),
  describeTab("changes", (t) => ({ kind: "changes", worktree: t.worktree ?? null, focus: t.focus ?? null, project_id: t.projectId })),
  describeTab("file", (t) => editorView(t.projectId, t.path, t.worktree ?? null, t.line)),
  describeTab("projectFile", (t) => editorView(t.projectId, t.path, null, t.line)),
  describeTab("note", (t) => noteView(t.projectId, t.path)),
  describeTab("database", (t) => databaseView(t.projectId, `chat-${t.chatId}`)),
  describeTab("github", (t) => githubView(t.projectId)),
  describeTab("browser", (t) => ({ kind: "browser", url: t.current ?? t.url, title: t.title })),
  describeTab("terminal", (t) => ({ kind: "terminal", label: t.title ?? t.label, project_id: t.projectId })),
].map((d) => userViewTabs.item(d));
