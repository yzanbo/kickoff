import type { ChatDraftRequest, OpenViewRequest } from "@shared/types";
import { useServerEvent } from "@/api/events";
import { readSetting, writeSetting } from "@/lib/storage";
import { chatDraft, composerHandoff } from "@/lib/storageKeys";
import { addChats, knownChat } from "@/stores/chats";
import { showToast } from "@/ui/toast";
import { chatTargetName } from "@/features/chat/chatTitle";
import { openChatOrChild, openChildChat, openInRootSide } from "@/features/chat/children/openChild";
import { rootChatOf } from "@/features/chat/children/childChats";
import { appendBlock } from "@/features/chat/messages/quoteComment";
import { chatPaneOf } from "@/features/chat/pane/windowMessages";
import { openSqlFromChat } from "@/features/database/openSqlFromChat";
import { openMemoFromChat } from "@/features/memo/openMemoFrom";
import { canPopout, openPopout } from "./popout";
import { openChat, openProjectFile } from "./router";

/** 系譜のうち、まだ読み込んでいないチャットを一覧に入れる（親をたどって、いちばん上の親の右の欄に開けるように） */
function learnLineage(lineage: OpenViewRequest["lineage"]) {
  const unknown = lineage.filter((c) => !knownChat(c.id));
  if (unknown.length > 0) addChats(unknown);
}

/** ファイル・差分を、頼んだチャット（子チャットなら、いちばん上の親）の右の欄か別ウィンドウで開く（place を省けば右の欄。返答のファイルのチップと同じ） */
function openWorkFile(request: Extract<OpenViewRequest, { kind: "file" | "diff" }>) {
  const from = request.lineage.at(-1);
  if (!from) return;
  const root = rootChatOf(from, (id) => knownChat(id));
  const target = { projectId: request.project_id, ...(request.worktree ? { worktree: request.worktree } : {}) };
  const name = (request.path ?? "変更").split("/").pop();
  if (request.place === "window" && canPopout()) {
    if (request.kind === "file") return openPopout({ kind: "file", chatId: root.id, ...target, path: request.path, ...(request.line ? { line: request.line } : {}) }, `${name} — ファイル`);
    return openPopout({ kind: "changes", chatId: root.id, ...target, ...(request.path ? { focus: request.path } : {}) }, "変更");
  }
  const opened = openInRootSide(from.id, (rootId, side) =>
    request.kind === "file"
      ? side.openFile({ chatId: rootId, ...target, path: request.path, ...(request.line ? { line: request.line } : {}) })
      : side.openChanges({ chatId: rootId, ...target, ...(request.path ? { focus: request.path } : {}) }),
  );
  // 右の欄を置けない（親が分からない）ときはファイルタブ
  if (!opened && request.kind === "file") openProjectFile(request.project_id, { path: request.path, ...(request.line ? { line: request.line } : {}), ...(request.worktree ? { worktree: request.worktree } : {}) });
}

/** AI の頼み（open_view）を、画面のいまの開き方で開く */
function openRequested(request: OpenViewRequest) {
  learnLineage(request.lineage);
  if (request.kind === "memo") {
    // 頼んだチャット（子チャットなら、いちばん上の親の右の欄。メモのチャットならメモのタブ）から開くのと同じ
    const from = request.lineage.at(-1);
    openMemoFromChat({ projectId: request.project_id, path: request.path, chatId: from?.id ?? null, place: request.place ?? undefined });
    return;
  }
  if (request.kind === "file" || request.kind === "diff") return openWorkFile(request);
  const target = request.lineage.at(-1);
  if (!target) return;
  // SQL は、頼んだチャットの右の欄の DB クライアントの新しい SQL のタブ（ツールの行の「SQL のタブで開く」と同じ）
  if (request.kind === "sql") return openSqlFromChat(target, { id: request.connection_id }, request.sql);
  if (target.parent_chat_id !== null) openChildChat(target, request.place ?? undefined);
  else openChat(target.project_id, target.id);
}

/**
 * AI の頼み（chat_draft）: 入れる先のチャットの入力欄の後ろに空行を挟んで足し（画面がなければ書きかけの文に足す）、親チャットに入れるなら
 * 「子チャットから渡した」の札も付ける（「親チャットに渡す」と同じ）。画面は移さず「〇〇に下書きを入れました［開く］」と知らせる
 */
function putDraft(request: ChatDraftRequest) {
  learnLineage(request.lineage);
  const target = request.lineage.at(-1);
  if (!target) return;
  if (request.from) writeSetting(composerHandoff(target.id), request.from);
  const pane = chatPaneOf(target.id);
  if (pane) pane.fillComposer(request.text, { append: true, focus: false });
  else writeSetting(chatDraft(target.id), appendBlock(readSetting(chatDraft(target.id)), request.text));
  const chat = knownChat(target.id) ?? target;
  showToast(`${chatTargetName(chat)}に下書きを入れました`, { label: "開く", run: () => openChatOrChild(chat) });
}

/**
 * チャットの AI がメモ・家系のチャット・ファイル・差分・SQL を開く（コアの SSE `open_view`）・下書きを入れる（`chat_draft`）よう頼んだら、
 * 頼まれた場所（省けば設定の開き方）で開く・入れる。Mac のアプリのメインのウィンドウだけが受ける（別ウィンドウ・ほかのブラウザでは開かない。
 * 開いているウィンドウの数だけ開かないように）
 */
export function useAiOpenRequests() {
  useServerEvent((e) => {
    if (!window.kickoff) return;
    if (e.type === "open_view") openRequested(e.request);
    else if (e.type === "chat_draft") putDraft(e.request);
  });
}
